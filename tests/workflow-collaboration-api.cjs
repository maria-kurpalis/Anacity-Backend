const assert = require('node:assert/strict');
const { fixtureIdentity } = require('./fixture-identity.cjs');
const { randomUUID } = require('node:crypto');

async function verifyWorkflowCollaborationApi() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const { seeder } = require('../dist/seeders/runner');
  const { app } = require('../dist/app');
  const { Community, Resident, Admin, MoveRequest, CommunityWorkflowConfig, RequestChecklist, RequestComment, AuditLog } = require('../dist/models');
  const queryInterface = sequelize.getQueryInterface();
  let server;
  let ownsDatabase = false;
  try {
    assert.equal((await queryInterface.showAllTables()).length, 0, 'Workflow/checklist/comment API tests refuse an existing database');
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
    const fail = (response, status, field) => {
      assert.equal(response.status, status, JSON.stringify(response.body));
      assert.equal(response.body.success, false);
      assert.ok(response.body.errors.some((error) => error.field === field), JSON.stringify(response.body));
    };
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const [resident, otherResident] = await Resident.findAll({ where: { communityId: green.id } });
    const outsideResident = await Resident.findOne({ where: { communityId: marina.id } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const configPath = (communityId = green.id, type = 'MOVE_IN') => `/communities/${communityId}/workflow-config/${type}`;
    const configInput = {
      adminId: admin.id, requiredFields: ['notes'], requiredDocuments: ['CUSTOM_COMMUNITY_FORM'],
      allowedDays: ['MONDAY'], allowedTimeSlots: [{ start: '09:00', end: '12:00' }], instructions: ' Approved timings. ',
    };
    const put = (input = configInput, communityId = green.id, type = 'MOVE_IN') => call('PUT', `/admin${configPath(communityId, type)}`, input);
    for (const community of [green, marina]) {
      for (const type of ['MOVE_IN', 'MOVE_OUT']) {
        const result = await call('GET', configPath(community.id, type));
        assert.equal(result.status, 200);
        assert.equal(result.body.data.communityId, community.id);
        assert.equal(result.body.data.requestType, type);
      }
    }
    fail(await call('GET', configPath(randomUUID())), 404, 'workflowConfig');
    fail(await call('GET', configPath('1')), 400, 'communityId');
    fail(await call('GET', configPath(green.id, 'MOVE_OTHER')), 400, 'requestType');
    fail(await put(configInput, green.id, 'move_in'), 400, 'requestType');
    fail(await put(configInput, randomUUID()), 404, 'communityId');
    fail(await put({ ...configInput, adminId: outsideAdmin.id }), 403, 'adminId');
    fail(await put({ ...configInput, adminId: randomUUID() }), 404, 'adminId');
    fail(await put({ ...configInput, adminId: 1 }), 400, 'adminId');
    for (const field of ['requiredFields', 'requiredDocuments', 'allowedDays', 'allowedTimeSlots', 'instructions']) {
      const input = { ...configInput };
      delete input[field];
      fail(await put(input), 400, field);
    }
    for (const [field, value, errorField = field] of [
      ['requiredFields', {}], ['requiredFields', ['status']], ['requiredFields', [1]],
      ['requiredDocuments', ['']], ['requiredDocuments', ['x'.repeat(101)]], ['requiredDocuments', null],
      ['allowedDays', ['monday']], ['allowedDays', ['HOLIDAY']], ['allowedDays', 'MONDAY'],
      ['allowedTimeSlots', {}], ['allowedTimeSlots', [null], 'allowedTimeSlots.0'],
      ['allowedTimeSlots', [{ start: '25:00', end: '26:00' }], 'allowedTimeSlots.0'],
      ['allowedTimeSlots', [{ start: '12:00', end: '09:00' }], 'allowedTimeSlots.0'],
      ['allowedTimeSlots', [{ start: '09:00', end: '09:00' }], 'allowedTimeSlots.0'],
      ['allowedTimeSlots', [{ start: '09:00', end: '12:00', extra: true }], 'allowedTimeSlots.0'],
      ['allowedTimeSlots', [{ start: '09:00' }], 'allowedTimeSlots.0'], ['instructions', null],
    ]) fail(await put({ ...configInput, [field]: value }), 400, errorField);
    fail(await put({ ...configInput, instructions: '\0' }), 400, 'body');
    fail(await put({ ...configInput, communityId: marina.id }), 400, 'communityId');
    fail(await put({ ...configInput, requestType: 'MOVE_OUT' }), 400, 'requestType');
    assert.equal(await AuditLog.count(), 0);
    const original = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: 'MOVE_IN' } });
    const originalId = original.id;
    const updated = await put(configInput, green.id.toUpperCase());
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.id, originalId);
    assert.equal(updated.body.data.instructions, 'Approved timings.');
    assert.deepEqual((await call('GET', configPath())).body.data.requiredDocuments, ['CUSTOM_COMMUNITY_FORM']);
    const updateAudit = await AuditLog.findOne({ where: { action: 'WORKFLOW_CONFIG_UPDATED' } });
    assert.equal(updateAudit.moveRequestId, null);
    assert.equal(updateAudit.actorId, admin.id);
    assert.equal(updateAudit.actorType, 'ADMIN');
    assert.equal(updateAudit.metadata.workflowConfigId, originalId);
    assert.deepEqual(updateAudit.newValue.requiredFields, ['notes']);
    assert.notDeepEqual(updateAudit.previousValue.requiredFields, ['notes']);
    await put();
    assert.equal(await CommunityWorkflowConfig.count({ where: { communityId: green.id, requestType: 'MOVE_IN' } }), 1);

    const rollbackConfig = async (creating) => {
      const before = creating ? null : (await original.reload()).toJSON();
      const count = await AuditLog.count();
      const createAudit = AuditLog.create;
      AuditLog.create = async () => { throw new Error('TEST_CONFIG_AUDIT_FAILURE'); };
      try { fail(await put({ ...configInput, instructions: 'Should roll back' }), 500, 'request'); }
      finally { AuditLog.create = createAudit; }
      const current = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: 'MOVE_IN' } });
      assert.deepEqual(current?.toJSON() ?? null, before);
      assert.equal(await AuditLog.count(), count);
    };
    await rollbackConfig(false);
    await original.destroy();
    fail(await call('GET', configPath()), 404, 'workflowConfig');
    await rollbackConfig(true);
    const created = await put();
    assert.equal(created.status, 200);
    assert.notEqual(created.body.data.id, originalId);
    const createAudit = await AuditLog.findOne({ where: { action: 'WORKFLOW_CONFIG_CREATED' } });
    assert.equal(createAudit.previousValue, null);
    assert.equal(createAudit.newValue.id, created.body.data.id);

    const newRequest = async () => {
      const result = await call('POST', '/move-requests', { residentId: resident.id, type: 'MOVE_IN' });
      assert.equal(result.status, 201);
      return result.body.data;
    };
    const request = await newRequest();
    const other = await newRequest();
    const requestPath = `/move-requests/${request.id}`;
    // Live config changes through PUT are immediately honored by resident submission.
    fail(await call('POST', `${requestPath}/submit`), 422, 'notes');
    await call('PATCH', requestPath, { notes: 'Required by the new config.' });
    fail(await call('POST', `${requestPath}/submit`), 422, 'documents.CUSTOM_COMMUNITY_FORM');
    const emptyConfig = { adminId: admin.id, requiredFields: [], requiredDocuments: [], allowedDays: [], allowedTimeSlots: [], instructions: '' };
    assert.equal((await put(emptyConfig)).status, 200);
    assert.equal((await call('POST', `${requestPath}/submit`)).status, 200);

    const checklistPath = `${requestPath}/checklist`;
    assert.deepEqual((await call('GET', checklistPath)).body.data, []);
    assert.deepEqual((await call('GET', `${requestPath}/comments`)).body.data, []);
    for (const resource of ['checklist', 'comments']) {
      fail(await call('GET', `/move-requests/${randomUUID()}/${resource}`), 404, 'id');
      fail(await call('GET', `/move-requests/1/${resource}`), 400, 'id');
    }
    const first = await RequestChecklist.create({ moveRequestId: request.id, key: 'first', label: 'First check', createdAt: new Date('2026-01-01') });
    const second = await RequestChecklist.create({ moveRequestId: request.id, key: 'second', label: 'Second check', createdAt: new Date('2026-01-02') });
    const otherItem = await RequestChecklist.create({ moveRequestId: other.id, key: 'other', label: 'Other check' });
    const listed = await call('GET', checklistPath);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.data.map((item) => item.id), [first.id, second.id]);
    const patch = (body, requestId = request.id, checklistId = first.id) => call('PATCH', `/admin/move-requests/${requestId}/checklist/${checklistId}`, body);
    const completion = { adminId: admin.id, status: 'COMPLETED' };
    fail(await patch({ ...completion, adminId: outsideAdmin.id }), 403, 'adminId');
    fail(await patch({ ...completion, adminId: randomUUID() }), 404, 'adminId');
    fail(await patch({ ...completion, adminId: 1 }), 400, 'adminId');
    fail(await patch(completion, request.id, otherItem.id), 404, 'checklistId');
    fail(await patch(completion, request.id, randomUUID()), 404, 'checklistId');
    fail(await patch(completion, randomUUID()), 404, 'id');
    fail(await patch(completion, request.id, '1'), 400, 'checklistId');
    for (const status of [undefined, null, 'APPROVED', '', 1]) fail(await patch({ ...completion, status }), 400, 'status');
    for (const field of ['completedByType', 'completedById', 'completedAt', 'moveRequestId', 'key', 'label']) {
      fail(await patch({ ...completion, [field]: 'forbidden' }), 400, field);
    }
    const complete = await patch(completion);
    assert.equal(complete.status, 200);
    assert.equal(complete.body.data.completedByType, 'ADMIN');
    assert.equal(complete.body.data.completedById, admin.id);
    assert.ok(complete.body.data.completedAt);
    const checklistAudit = await AuditLog.findOne({ where: { moveRequestId: request.id, action: 'CHECKLIST_ITEM_UPDATED' } });
    assert.equal(checklistAudit.previousValue.status, 'PENDING');
    assert.equal(checklistAudit.newValue.status, 'COMPLETED');
    assert.equal(checklistAudit.metadata.checklistId, first.id);
    for (const status of ['PENDING', 'NOT_APPLICABLE']) {
      await patch(completion);
      const reset = await patch({ adminId: admin.id, status });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.data.status, status);
      for (const field of ['completedByType', 'completedById', 'completedAt']) assert.equal(reset.body.data[field], null);
    }
    const before = (await first.reload()).toJSON();
    const auditCount = await AuditLog.count();
    const originalAudit = AuditLog.create;
    AuditLog.create = async () => { throw new Error('TEST_CHECKLIST_AUDIT_FAILURE'); };
    try { fail(await patch(completion), 500, 'request'); }
    finally { AuditLog.create = originalAudit; }
    assert.deepEqual((await first.reload()).toJSON(), before);
    assert.equal(await AuditLog.count(), auditCount);
    assert.equal((await MoveRequest.findByPk(request.id)).status, 'SUBMITTED');

    const commentsPath = `${requestPath}/comments`;
    for (const [path, identity] of [[commentsPath, { residentId: resident.id }], [`/admin${commentsPath}`, { adminId: admin.id }]]) {
      for (const comment of [undefined, null, '', '  ', 1, {}, []]) fail(await call('POST', path, { ...identity, comment }), 400, 'comment');
      fail(await call('POST', path, { ...identity, comment: '\0' }), 400, 'body');
      for (const field of ['authorType', 'authorId', 'moveRequestId', 'createdAt']) fail(await call('POST', path, { ...identity, comment: 'Text', [field]: 'forbidden' }), 400, field);
    }
    for (const different of [otherResident, outsideResident]) fail(await call('POST', commentsPath, { residentId: different.id, comment: 'Not mine' }), 403, 'residentId');
    fail(await call('POST', commentsPath, { residentId: randomUUID(), comment: 'Missing resident' }), 404, 'residentId');
    fail(await call('POST', commentsPath, { residentId: 1, comment: 'Numeric ID' }), 400, 'residentId');
    fail(await call('POST', `/admin${commentsPath}`, { adminId: outsideAdmin.id, comment: 'Other community' }), 403, 'adminId');
    fail(await call('POST', `/admin${commentsPath}`, { adminId: randomUUID(), comment: 'Missing admin' }), 404, 'adminId');
    fail(await call('POST', `/admin${commentsPath}`, { adminId: 1, comment: 'Numeric ID' }), 400, 'adminId');
    fail(await call('POST', `/move-requests/${randomUUID()}/comments`, { residentId: resident.id, comment: 'Missing request' }), 404, 'id');
    fail(await call('POST', `/admin/move-requests/${randomUUID()}/comments`, { adminId: admin.id, comment: 'Missing request' }), 404, 'id');
    assert.equal(await RequestComment.count({ where: { moveRequestId: request.id } }), 0);
    const residentComment = await call('POST', commentsPath, { residentId: resident.id.toUpperCase(), comment: '  I have uploaded the requested document.  ' });
    assert.equal(residentComment.status, 201);
    assert.equal(residentComment.body.data.comment, 'I have uploaded the requested document.');
    assert.equal(residentComment.body.data.authorType, 'RESIDENT');
    assert.equal(residentComment.body.data.authorId, resident.id);
    const adminComment = await call('POST', `/admin${commentsPath}`, { adminId: admin.id, comment: 'Please verify your move date.' });
    assert.equal(adminComment.status, 201);
    assert.equal(adminComment.body.data.authorType, 'ADMIN');
    assert.equal(adminComment.body.data.authorId, admin.id);
    const old = await RequestComment.create({ moveRequestId: request.id, authorType: 'ADMIN', authorId: admin.id, comment: 'Oldest', createdAt: new Date('2026-01-01') });
    await RequestComment.create({ moveRequestId: other.id, authorType: 'RESIDENT', authorId: resident.id, comment: 'Other request' });
    const comments = await call('GET', commentsPath);
    assert.equal(comments.status, 200);
    assert.equal(comments.body.data.length, 3);
    assert.equal(comments.body.data[0].id, old.id);
    assert.ok(comments.body.data.every((row) => row.moveRequestId === request.id));
    for (let i = 1; i < comments.body.data.length; i++) assert.ok(comments.body.data[i].createdAt >= comments.body.data[i - 1].createdAt);
    console.log('PASS: seven workflow/checklist/comment APIs, configuration validation and upsert, shared submission rules, resident ownership/admin scoping, ordering, completion metadata and atomic config/checklist audit rollback');
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

module.exports = { verifyWorkflowCollaborationApi };
if (require.main === module) {
  verifyWorkflowCollaborationApi().catch((error) => { console.error(error); process.exitCode = 1; });
}
