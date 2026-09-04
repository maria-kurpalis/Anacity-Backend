const assert = require('node:assert/strict');
const { fixtureIdentity } = require('./fixture-identity.cjs');
const { randomUUID } = require('node:crypto');

async function verifyMoveRequestApi() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const { seeder } = require('../dist/seeders/runner');
  const { app } = require('../dist/app');
  const {
    Resident, Community, MoveRequest, CommunityWorkflowConfig, Document, StatusHistory, AuditLog,
  } = require('../dist/models');
  const queryInterface = sequelize.getQueryInterface();
  let server;
  let ownsDatabase = false;
  try {
    assert.equal((await queryInterface.showAllTables()).length, 0, 'API tests refuse an existing database');
    ownsDatabase = true;
    await migrator.up();
    await seeder.up();
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (method, path, body) => {
      const response = await fetch(base + path, {
        method, headers: { ...await fixtureIdentity(path), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const assertFailure = (response, status, field) => {
      assert.equal(response.status, status, JSON.stringify(response.body));
      assert.equal(response.body.success, false);
      assert.ok(response.body.errors.length);
      if (field) assert.ok(response.body.errors.some((error) => error.field === field), JSON.stringify(response.body));
      assert.ok(!('stack' in response.body));
    };
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const resident = await Resident.findOne({ where: { communityId: green.id } });
    const marinaResident = await Resident.findOne({ where: { communityId: marina.id } });
    const create = async (residentId = resident.id, type = 'MOVE_IN') => {
      const response = await call('POST', '/move-requests', { residentId, type });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.data.status, 'DRAFT');
      assert.equal(response.body.data.requestedDate, null);
      assert.equal(response.body.data.requestedTimeSlot, null);
      return response.body.data;
    };
    const request = await create();
    assert.equal(request.communityId, resident.communityId);
    assert.equal(request.unitId, resident.unitId);
    assertFailure(await call('POST', '/move-requests', { residentId: 1, type: 'MOVE_IN' }), 400, 'residentId');
    assertFailure(await call('POST', '/move-requests', { residentId: randomUUID(), type: 'MOVE_IN' }), 404, 'residentId');
    assertFailure(await call('POST', '/move-requests', { residentId: resident.id, type: 'INVALID' }), 400, 'type');
    assertFailure(await call('POST', '/move-requests', { residentId: resident.id, type: 'MOVE_IN', communityId: marina.id }), 400, 'communityId');
    assertFailure(await call('GET', '/move-requests/not-a-uuid'), 400, 'id');
    assertFailure(await call('GET', `/move-requests/${randomUUID()}`), 404, 'id');
    assertFailure(await call('GET', `/residents/${randomUUID()}/move-requests`), 404, 'residentId');
    const another = await create();
    const list = await call('GET', `/residents/${resident.id}/move-requests`);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.every((row) => row.residentId === resident.id));
    assert.ok(list.body.data.some((row) => row.id === another.id));
    for (let i = 0; i < list.body.data.length; i++) {
      const row = list.body.data[i];
      assert.ok(row.community.name);
      assert.ok(row.unit.unitNumber);
      if (i) assert.ok(row.createdAt <= list.body.data[i - 1].createdAt);
    }

    const path = `/move-requests/${request.id}`;
    const partial = await call('PATCH', path, { notes: 'Use the service lift' });
    assert.equal(partial.status, 200, JSON.stringify(partial.body));
    assert.equal(partial.body.data.details.notes, 'Use the service lift');
    assert.equal(partial.body.data.details.movingCompany, null);
    assert.equal(partial.body.data.details.vehicleCount, null);
    assert.equal((await call('PATCH', path, { occupantCount: 0 })).body.data.details.notes, 'Use the service lift');
    for (const [field, value] of Object.entries({ residentId: marinaResident.id, communityId: marina.id, unitId: marinaResident.unitId, type: 'MOVE_OUT', status: 'APPROVED', reviewedBy: randomUUID(), reviewedAt: new Date().toISOString() })) {
      assertFailure(await call('PATCH', path, { [field]: value }), 400, field);
    }
    for (const [field, value] of [['requestedDate', '2026-02-30'], ['requestedTimeSlot', '25:00-26:00'], ['vehicleCount', -1], ['occupantCount', 1.5], ['vehicleCount', '1'], ['vehicleDetails', 'truck'], ['notes', false], ['movingCompany', 'x'.repeat(256)]]) {
      assertFailure(await call('PATCH', path, { [field]: value }), 400, field);
    }
    assertFailure(await call('PATCH', path, {}), 400, 'body');
    assertFailure(await call('PATCH', path, { notes: '\0' }), 400, 'body');
    assertFailure(await call('POST', `${path}/submit`, { status: 'APPROVED' }), 400, 'status');
    const malformed = await fetch(base + '/move-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).success, false);

    const missing = await call('POST', `${path}/submit`);
    assertFailure(missing, 422, 'vehicleCount');
    assert.ok(!missing.body.errors.some((error) => error.field.startsWith('documents.')), 'Optional documents never create submission errors');
    assert.ok(!missing.body.errors.some((error) => error.field === 'occupantCount'), 'Zero is a present count');
    assert.equal((await MoveRequest.findByPk(request.id)).status, 'DRAFT');
    assert.equal(await StatusHistory.count({ where: { moveRequestId: request.id } }), 0);

    await call('PATCH', path, { requestedDate: '2026-09-06', requestedTimeSlot: '08:00-11:00', vehicleCount: 1, occupantCount: 2 });
    const rejectedDocument = await Document.create({ moveRequestId: request.id, documentType: 'IDENTITY_DOCUMENT', fileUrl: 'https://example.test/rejected.pdf', status: 'REJECTED' });
    const invalidSchedule = await call('POST', `${path}/submit`);
    assertFailure(invalidSchedule, 422, 'requestedDate');
    assertFailure(invalidSchedule, 422, 'requestedTimeSlot');
    assert.ok(!invalidSchedule.body.errors.some((error) => error.field.startsWith('documents.')));
    // Saturday is valid under Green Heights' seeded configuration.
    await call('PATCH', path, { requestedDate: '2026-09-05', requestedTimeSlot: '09:00-12:00' });

    // Force a late failure: status and history must roll back with the failed audit insert.
    const createAudit = AuditLog.create;
    AuditLog.create = async () => { throw new Error('TEST_AUDIT_FAILURE'); };
    try { assertFailure(await call('POST', `${path}/submit`), 500); }
    finally { AuditLog.create = createAudit; }
    assert.equal((await MoveRequest.findByPk(request.id)).status, 'DRAFT');
    assert.equal((await MoveRequest.findByPk(request.id)).submittedAt, null);
    assert.equal(await StatusHistory.count({ where: { moveRequestId: request.id } }), 0);
    assert.equal(await AuditLog.count({ where: { moveRequestId: request.id } }), 0);

    const submitted = await call('POST', `${path}/submit`);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.data.status, 'SUBMITTED');
    assert.ok(submitted.body.data.submittedAt);
    assertFailure(await call('POST', `${path}/submit`), 409, 'status');
    assertFailure(await call('PATCH', path, { notes: 'Too late' }), 409, 'status');
    const history = await StatusHistory.findOne({ where: { moveRequestId: request.id } });
    assert.equal(history.fromStatus, 'DRAFT');
    assert.equal(history.toStatus, 'SUBMITTED');
    assert.equal(history.changedById, resident.id);
    assert.equal(await AuditLog.count({ where: { moveRequestId: request.id } }), 1);
    const details = await call('GET', path);
    for (const key of ['resident', 'community', 'unit', 'details', 'documents', 'checklistItems', 'comments', 'statusHistories']) assert.ok(key in details.body.data, key);
    assert.equal(details.body.data.statusHistories.length, 1);
    await (await MoveRequest.findByPk(request.id)).update({ status: 'NEEDS_CHANGES' });
    assert.equal((await call('PATCH', path, { notes: 'Updated after review' })).status, 200);
    assert.equal((await call('POST', `${path}/submit`)).status, 200);
    assert.equal(await StatusHistory.count({ where: { moveRequestId: request.id } }), 2);
    assert.equal(await AuditLog.count({ where: { moveRequestId: request.id } }), 2);

    // Marina has a different required-field set and different slots; documents are optional.
    const marinaRequest = await create(marinaResident.id);
    const marinaPath = `/move-requests/${marinaRequest.id}`;
    await call('PATCH', marinaPath, { requestedDate: '2026-09-05', requestedTimeSlot: '08:00-11:00', occupantCount: 1 });
    const marinaMissing = await call('POST', `${marinaPath}/submit`);
    assertFailure(marinaMissing, 422, 'requestedDate');
    assert.ok(!marinaMissing.body.errors.some((error) => error.field.startsWith('documents.')));
    assert.ok(!marinaMissing.body.errors.some((error) => ['movingCompany', 'vehicleCount'].includes(error.field)));
    assert.equal((await MoveRequest.findByPk(marinaRequest.id)).status, 'DRAFT');
    await call('PATCH', marinaPath, { requestedDate: '2026-09-07' });
    assert.equal((await call('POST', `${marinaPath}/submit`)).status, 200, 'MOVE_IN submits with zero documents');
    assert.equal(await Document.count({ where: { moveRequestId: marinaRequest.id } }), 0);

    const moveOutRequest = await create(resident.id, 'MOVE_OUT');
    const moveOutPath = `/move-requests/${moveOutRequest.id}`;
    await call('PATCH', moveOutPath, { requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00', vehicleCount: 1 });
    assert.equal((await call('POST', `${moveOutPath}/submit`)).status, 200, 'MOVE_OUT submits with zero documents');
    assert.equal(await Document.count({ where: { moveRequestId: moveOutRequest.id } }), 0);

    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: marina.id, requestType: 'MOVE_OUT' } });
    const original = config.toJSON();
    const dynamicRequest = await create(marinaResident.id, 'MOVE_OUT');
    const dynamicPath = `/move-requests/${dynamicRequest.id}`;
    await config.update({ requiredFields: ['notes'], requiredDocuments: [], allowedDays: [], allowedTimeSlots: [] });
    assertFailure(await call('POST', `${dynamicPath}/submit`), 422, 'notes');
    await call('PATCH', dynamicPath, { notes: 'Config-driven requirement' });
    assert.equal((await call('POST', `${dynamicPath}/submit`)).status, 200, 'Requirements must follow live config');
    const badConfigRequest = await create(marinaResident.id, 'MOVE_OUT');
    await config.update({ requiredFields: ['unknownField'] });
    assertFailure(await call('POST', `/move-requests/${badConfigRequest.id}/submit`), 500, 'workflowConfig');
    await config.destroy();
    assertFailure(await call('POST', `/move-requests/${badConfigRequest.id}/submit`), 409, 'workflowConfig');
    await CommunityWorkflowConfig.create(original);
    const locked = await MoveRequest.findOne({ where: { status: 'APPROVED' } });
    assertFailure(await call('PATCH', `/move-requests/${locked.id}`, { notes: 'Denied' }), 409, 'status');
    assertFailure(await call('POST', `/move-requests/${locked.id}/submit`), 409, 'status');

    // Reverting nullable draft columns refuses incomplete data and leaves the schema intact.
    await assert.rejects(migrator.down({ step: 3 }), /null values/);
    assert.equal((await queryInterface.describeTable('move_requests')).requestedDate.allowNull, true);
    console.log('PASS: all five resident APIs, config-driven validation, protected fields, partial drafts, state guards, resubmission and atomic rollback');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      if (ownsDatabase) {
        const tables = await queryInterface.showAllTables();
        if (tables.length) await sequelize.query(`DROP TABLE ${tables.map((table) => queryInterface.quoteIdentifier(table)).join(', ')} CASCADE`);
        const [enums] = await sequelize.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
        for (const { typname } of enums) await sequelize.query(`DROP TYPE ${queryInterface.quoteIdentifier(typname)}`);
        await sequelize.query('DROP FUNCTION IF EXISTS reject_audit_logs_mutation()');
        await sequelize.query('DROP FUNCTION IF EXISTS reject_status_histories_mutation()');
      }
    } finally { await sequelize.close(); }
  }
}

module.exports = { verifyMoveRequestApi };
if (require.main === module) {
  verifyMoveRequestApi().catch((error) => { console.error(error); process.exitCode = 1; });
}
