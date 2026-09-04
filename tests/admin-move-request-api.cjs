const assert = require('node:assert/strict');
const { fixtureIdentity } = require('./fixture-identity.cjs');
const { randomUUID } = require('node:crypto');

async function verifyAdminMoveRequestApi() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const { seeder } = require('../dist/seeders/runner');
  const { app } = require('../dist/app');
  const {
    Community, Resident, Admin, MoveRequest, Document, CommunityWorkflowConfig,
    StatusHistory, AuditLog, RequestComment, MoveRequestStatus,
  } = require('../dist/models');
  const { assertMoveRequestTransition } = require('../dist/services/move-request-state.service');
  const queryInterface = sequelize.getQueryInterface();
  let server;
  let ownsDatabase = false;
  try {
    assert.equal((await queryInterface.showAllTables()).length, 0, 'Admin API tests refuse an existing database');
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
      assert.ok(!('stack' in response.body));
    };
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const resident = await Resident.findOne({ where: { communityId: green.id } });
    const outsideResident = await Resident.findOne({ where: { communityId: marina.id } });
    const submitted = await MoveRequest.findOne({ where: { communityId: green.id, status: 'SUBMITTED' } });
    const newRequest = (status, type = 'MOVE_IN') => MoveRequest.create({
      communityId: green.id, unitId: resident.unitId, residentId: resident.id, status, type,
      requestedDate: submitted.requestedDate, requestedTimeSlot: submitted.requestedTimeSlot,
      submittedAt: status === 'DRAFT' ? null : new Date(),
    });
    const action = (id, name, input = { adminId: admin.id }) => call('POST', `/admin/move-requests/${id}/${name}`, input);
    const counts = async (id) => ({
      history: await StatusHistory.count({ where: { moveRequestId: id } }),
      audit: await AuditLog.count({ where: { moveRequestId: id } }),
      comments: await RequestComment.count({ where: { moveRequestId: id } }),
    });
    const listPath = `/admin/communities/${green.id}/move-requests`;
    const fresh = await newRequest('DRAFT');
    const list = await call('GET', listPath);
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].id, fresh.id);
    assert.ok(list.body.data.every((row) => row.communityId === green.id));
    for (let i = 0; i < list.body.data.length; i++) {
      const row = list.body.data[i];
      assert.ok(row.resident.name);
      assert.ok(row.unit.unitNumber);
      assert.ok('details' in row);
      if (i) assert.ok(row.createdAt <= list.body.data[i - 1].createdAt);
    }
    for (const [query, predicate] of [
      ['status=SUBMITTED', (row) => row.status === 'SUBMITTED'],
      ['type=MOVE_OUT', (row) => row.type === 'MOVE_OUT'],
      [`residentId=${resident.id}`, (row) => row.residentId === resident.id],
      [`status=DRAFT&type=MOVE_IN&residentId=${resident.id}`, (row) => row.id === fresh.id || (row.status === 'DRAFT' && row.type === 'MOVE_IN' && row.residentId === resident.id)],
    ]) {
      const filtered = await call('GET', `${listPath}?${query}`);
      assert.equal(filtered.status, 200);
      assert.ok(filtered.body.data.length);
      assert.ok(filtered.body.data.every((row) => row.communityId === green.id && predicate(row)));
    }
    for (const id of [outsideResident.id, randomUUID()]) {
      assert.deepEqual((await call('GET', `${listPath}?residentId=${id}`)).body.data, []);
    }
    for (const [query, field] of [
      ['status=INVALID', 'status'], ['type=INVALID', 'type'], ['residentId=1', 'residentId'],
      ['status=', 'status'], ['type=MOVE_IN&type=MOVE_OUT', 'type'],
      [`residentId=${resident.id}&residentId=${resident.id}`, 'residentId'],
      [`communityId=${marina.id}`, 'communityId'],
    ]) fail(await call('GET', `${listPath}?${query}`), 400, field);
    fail(await call('GET', '/admin/communities/1/move-requests'), 400, 'communityId');
    fail(await call('GET', `/admin/communities/${randomUUID()}/move-requests`), 404, 'communityId');
    fail(await call('GET', '/admin/move-requests/1'), 400, 'id');
    fail(await call('GET', `/admin/move-requests/${randomUUID()}`), 404, 'id');

    const reviewDetails = await call('GET', `/admin/move-requests/${submitted.id}`);
    assert.equal(reviewDetails.status, 200);
    for (const key of ['resident', 'unit', 'community', 'details', 'documents', 'checklistItems', 'comments', 'statusHistories', 'workflowConfig']) {
      assert.ok(key in reviewDetails.body.data, key);
    }
    assert.equal(reviewDetails.body.data.workflowConfig.communityId, green.id);
    assert.equal(reviewDetails.body.data.workflowConfig.requestType, submitted.type);
    const marinaRequest = await MoveRequest.findOne({ where: { communityId: marina.id } });
    const marinaDetails = (await call('GET', `/admin/move-requests/${marinaRequest.id}`)).body.data;
    assert.equal(marinaDetails.workflowConfig.communityId, marina.id);
    assert.equal(marinaDetails.workflowConfig.requestType, marinaRequest.type);
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: 'MOVE_IN' } });
    const originalConfig = config.toJSON();
    await config.update({ instructions: 'Current community-specific instructions.' });
    assert.equal((await call('GET', `/admin/move-requests/${fresh.id}`)).body.data.workflowConfig.instructions, 'Current community-specific instructions.');
    await config.destroy();
    assert.equal((await call('GET', `/admin/move-requests/${fresh.id}`)).body.data.workflowConfig, null);
    await CommunityWorkflowConfig.create(originalConfig);

    const actions = ['review', 'approve', 'request-changes', 'reject'];
    const inputFor = (name, adminId = admin.id) => ({ adminId, ...(['request-changes', 'reject'].includes(name) ? { reason: 'Please correct the document.' } : {}) });
    for (const name of actions) {
      fail(await action(submitted.id, name, inputFor(name, outsideAdmin.id)), 403, 'adminId');
      fail(await action(submitted.id, name, inputFor(name, randomUUID())), 404, 'adminId');
      fail(await action(submitted.id, name, inputFor(name, 1)), 400, 'adminId');
      fail(await action(randomUUID(), name, inputFor(name)), 404, 'id');
      fail(await action('invalid', name, inputFor(name)), 400, 'id');
      fail(await action(submitted.id, name, { ...inputFor(name), status: 'APPROVED' }), 400, 'status');
      fail(await action(submitted.id, name, { ...inputFor(name), reviewedBy: outsideAdmin.id }), 400, 'reviewedBy');
      fail(await action(submitted.id, name, {}), 400, 'adminId');
    }
    for (const name of ['request-changes', 'reject']) {
      for (const reason of [undefined, null, '', '   ', 1, [], {}]) {
        fail(await action(submitted.id, name, { adminId: admin.id, reason }), 400, 'reason');
      }
    }
    for (const comment of [null, '', '  ', 4, {}]) fail(await action(submitted.id, 'approve', { adminId: admin.id, comment }), 400, 'comment');
    fail(await action(submitted.id, 'approve', { adminId: admin.id, comment: '\0' }), 400, 'body');
    assert.deepEqual(await counts(submitted.id), { history: 0, audit: 0, comments: 0 });
    assert.equal((await submitted.reload()).status, 'SUBMITTED');

    // Check every status pair, including terminal statuses and unimplemented transitions.
    const permitted = new Set(['DRAFT:SUBMITTED', 'NEEDS_CHANGES:SUBMITTED', 'SUBMITTED:UNDER_REVIEW', 'UNDER_REVIEW:APPROVED', 'UNDER_REVIEW:NEEDS_CHANGES', 'UNDER_REVIEW:REJECTED', 'APPROVED:COMPLETED', 'DRAFT:CANCELLED', 'SUBMITTED:CANCELLED', 'NEEDS_CHANGES:CANCELLED']);
    for (const from of Object.values(MoveRequestStatus)) {
      for (const to of Object.values(MoveRequestStatus)) {
        if (permitted.has(`${from}:${to}`)) assert.doesNotThrow(() => assertMoveRequestTransition(from, to));
        else assert.throws(() => assertMoveRequestTransition(from, to), (error) => error.status === 400);
      }
    }
    for (const state of ['DRAFT', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED']) {
      const request = await newRequest(state);
      for (const name of actions) fail(await action(request.id, name, inputFor(name)), 400, 'status');
      assert.deepEqual(await counts(request.id), { history: 0, audit: 0, comments: 0 });
    }
    for (const name of ['approve', 'request-changes', 'reject']) fail(await action(submitted.id, name, inputFor(name)), 400, 'status');

    // A failure in the final write must undo status/reviewer/time, comment and history for every action.
    for (const name of actions) {
      const request = await newRequest(name === 'review' ? 'SUBMITTED' : 'UNDER_REVIEW');
      const before = request.toJSON();
      const originalCreate = AuditLog.create;
      AuditLog.create = async () => { throw new Error('TEST_ADMIN_AUDIT_FAILURE'); };
      try {
        fail(await action(request.id, name, { ...inputFor(name), ...(name === 'approve' ? { comment: 'Verified.' } : {}) }), 500, 'request');
      } finally { AuditLog.create = originalCreate; }
      assert.deepEqual((await request.reload()).toJSON(), before);
      assert.deepEqual(await counts(request.id), { history: 0, audit: 0, comments: 0 });
    }

    const started = await action(submitted.id, 'review');
    assert.equal(started.status, 200);
    assert.equal(started.body.data.status, 'UNDER_REVIEW');
    assert.equal(started.body.data.reviewedBy, admin.id);
    assert.ok(started.body.data.reviewedAt);
    fail(await action(submitted.id, 'review'), 400, 'status');
    const changes = await action(submitted.id, 'request-changes', { adminId: admin.id, reason: '  Please upload a correct identity document.  ' });
    assert.equal(changes.status, 200);
    assert.equal(changes.body.data.status, 'NEEDS_CHANGES');
    const changeComment = await RequestComment.findOne({ where: { moveRequestId: submitted.id } });
    assert.equal(changeComment.comment, 'Please upload a correct identity document.');
    assert.equal(changeComment.authorType, 'ADMIN');
    assert.equal(changeComment.authorId, admin.id);
    assert.equal((await call('PATCH', `/move-requests/${submitted.id}`, { notes: 'Identity document corrected.' })).status, 200);
    await Document.create({ moveRequestId: submitted.id, documentType: 'IDENTITY_DOCUMENT', fileUrl: 'https://example.test/correct-id.pdf' });
    const resubmitted = await call('POST', `/move-requests/${submitted.id}/submit`);
    assert.equal(resubmitted.status, 200, JSON.stringify(resubmitted.body));
    assert.equal(resubmitted.body.data.status, 'SUBMITTED');
    fail(await action(submitted.id, 'approve'), 400, 'status');
    assert.equal((await action(submitted.id, 'review')).status, 200);
    const approval = await action(submitted.id, 'approve', { adminId: admin.id, comment: '  All requirements verified.  ' });
    assert.equal(approval.status, 200);
    assert.equal(approval.body.data.status, 'APPROVED');
    assert.deepEqual(await counts(submitted.id), { history: 5, audit: 5, comments: 2 });
    const histories = await StatusHistory.findAll({ where: { moveRequestId: submitted.id }, order: [['createdAt', 'ASC']] });
    assert.deepEqual(histories.map((row) => [row.fromStatus, row.toStatus]), [
      ['SUBMITTED', 'UNDER_REVIEW'], ['UNDER_REVIEW', 'NEEDS_CHANGES'], ['NEEDS_CHANGES', 'SUBMITTED'],
      ['SUBMITTED', 'UNDER_REVIEW'], ['UNDER_REVIEW', 'APPROVED'],
    ]);
    for (const history of histories.filter((row) => row.changedByType === 'ADMIN')) assert.equal(history.changedById, admin.id);
    const approvalAudit = await AuditLog.findOne({ where: { moveRequestId: submitted.id, action: 'MOVE_REQUEST_APPROVED' } });
    assert.equal(approvalAudit.actorId, admin.id);
    assert.equal(approvalAudit.actorType, 'ADMIN');
    assert.equal(approvalAudit.previousValue.status, 'UNDER_REVIEW');
    assert.equal(approvalAudit.newValue.status, 'APPROVED');
    assert.equal(approvalAudit.metadata.comment, 'All requirements verified.');
    for (const name of actions) fail(await action(submitted.id, name, inputFor(name)), 400, 'status');
    fail(await call('PATCH', `/move-requests/${submitted.id}`, { status: 'DRAFT' }), 400, 'status');
    fail(await call('POST', `/move-requests/${submitted.id}/submit`), 409, 'status');

    const withoutComment = await newRequest('SUBMITTED');
    assert.equal(await Document.count({ where: { moveRequestId: withoutComment.id } }), 0);
    assert.equal((await action(withoutComment.id, 'review')).status, 200);
    assert.equal((await action(withoutComment.id, 'approve')).status, 200, 'A valid request can be approved with zero documents');
    assert.deepEqual(await counts(withoutComment.id), { history: 2, audit: 2, comments: 0 });

    const rejected = await newRequest('SUBMITTED');
    assert.equal((await action(rejected.id, 'review')).status, 200);
    const reason = 'Request does not satisfy community requirements.';
    const rejection = await action(rejected.id, 'reject', { adminId: admin.id, reason });
    assert.equal(rejection.status, 200);
    assert.equal(rejection.body.data.status, 'REJECTED');
    assert.equal(rejection.body.data.rejectionReason, reason);
    assert.equal(rejection.body.data.reviewedBy, admin.id);
    assert.deepEqual(await counts(rejected.id), { history: 2, audit: 2, comments: 1 });
    const rejectionHistory = await StatusHistory.findOne({ where: { moveRequestId: rejected.id, toStatus: 'REJECTED' } });
    assert.equal(rejectionHistory.reason, reason);
    const rejectionAudit = await AuditLog.findOne({ where: { moveRequestId: rejected.id, action: 'MOVE_REQUEST_REJECTED' } });
    assert.equal(rejectionAudit.newValue.rejectionReason, reason);
    fail(await call('PATCH', `/move-requests/${rejected.id}`, { notes: 'No longer editable' }), 409, 'status');
    console.log('PASS: all six admin APIs, community isolation, filters, review context, shared transitions, resident resubmission, comments/history/audits and rollback for every action');
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

module.exports = { verifyAdminMoveRequestApi };
if (require.main === module) {
  verifyAdminMoveRequestApi().catch((error) => { console.error(error); process.exitCode = 1; });
}
