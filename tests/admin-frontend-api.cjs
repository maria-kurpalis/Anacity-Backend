const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyAdminFrontendApi() {
  await withTestApi(async ({ models, call, fail, base }) => {
    const { Resident, Admin, MoveRequest, StatusHistory, AuditLog, RequestComment, Notification } = models;
    const resident = await Resident.findOne({ where: { email: 'ananya.rao@green-heights.example.test' } });
    const admin = await Admin.findOne({ where: { communityId: resident.communityId } });
    const outside = await Admin.findOne({ where: { email: 'vikram.shah@marina-residence.example.test' } });
    const staff = await Admin.create({ communityId: resident.communityId, name: 'Completing Staff', email: 'complete@example.test', phone: '9000000999', role: 'STAFF' });
    const reviewedAt = new Date('2026-09-01T08:00:00Z');
    const values = { residentId: resident.id, communityId: resident.communityId, unitId: resident.unitId, type: 'MOVE_IN',
      status: 'APPROVED', reviewedBy: admin.id, reviewedAt, requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00' };
    const approved = await MoveRequest.create(values);
    const complete = (id, body) => call('POST', `/admin/move-requests/${id}/complete`, body);
    fail(await complete(approved.id, { adminId: outside.id }), 403, 'adminId');
    fail(await complete(approved.id, { adminId: randomUUID() }), 404, 'adminId');
    fail(await complete(approved.id, { adminId: staff.id, status: 'COMPLETED' }), 400, 'status');
    fail(await complete(approved.id, { adminId: staff.id, comment: ' ' }), 400, 'comment');
    const draft = await MoveRequest.create({ ...values, status: 'DRAFT' });
    fail(await call('GET', `/admin/move-requests/${draft.id}?adminId=${outside.id}`), 403, 'adminId');
    fail(await call('GET', `/admin/move-requests/${draft.id}?adminId=1`), 400, 'adminId');
    assert.deepEqual((await call('GET', `/admin/move-requests/${draft.id}?adminId=${admin.id}`)).body.data.allowedActions, []);
    assert.deepEqual((await call('GET', `/admin/move-requests/${approved.id}?adminId=${admin.id}`)).body.data.allowedActions, ['complete']);
    fail(await complete(draft.id, { adminId: staff.id }), 400, 'status');
    fail(await complete(randomUUID(), { adminId: staff.id }), 404, 'id');
    const response = await complete(approved.id, { adminId: staff.id, comment: 'Move completed and keys returned.' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.status, 'COMPLETED');
    assert.equal(response.body.data.reviewedBy, admin.id, 'Completion preserves the approval reviewer');
    assert.equal(response.body.data.reviewedAt, reviewedAt.toISOString());
    const history = await StatusHistory.findOne({ where: { moveRequestId: approved.id } });
    assert.equal(history.fromStatus, 'APPROVED'); assert.equal(history.toStatus, 'COMPLETED');
    assert.equal(history.changedById, staff.id);
    assert.equal(await AuditLog.count({ where: { moveRequestId: approved.id, action: 'MOVE_REQUEST_COMPLETED' } }), 1);
    assert.equal(await RequestComment.count({ where: { moveRequestId: approved.id, authorType: 'ADMIN' } }), 1);
    assert.equal(await Notification.count({ where: { moveRequestId: approved.id, recipientId: resident.id, status: 'PENDING' } }), 1);
    fail(await complete(approved.id, { adminId: staff.id }), 400, 'status');
    assert.equal(await StatusHistory.count({ where: { moveRequestId: approved.id } }), 1, 'Duplicate completion creates no second event');

    const rollback = await MoveRequest.create(values);
    const create = Notification.create;
    Notification.create = async () => { throw new Error('Injected notification failure'); };
    try { assert.equal((await complete(rollback.id, { adminId: staff.id, comment: 'Must roll back' })).status, 500); }
    finally { Notification.create = create; }
    assert.equal((await rollback.reload()).status, 'APPROVED');
    for (const model of [StatusHistory, AuditLog, RequestComment, Notification]) assert.equal(await model.count({ where: { moveRequestId: rollback.id } }), 0);
    assert.equal((await complete(rollback.id, { adminId: staff.id })).status, 200);
    const summaryPath = `/admin/move-requests/${approved.id}/agent-summary`;
    fail(await call('GET', summaryPath), 400, 'adminId');
    fail(await call('GET', `${summaryPath}?adminId=${outside.id}`), 403, 'adminId');
    const summary = await call('GET', `${summaryPath}?adminId=${admin.id}`);
    assert.equal(summary.status, 200); assert.equal(summary.body.data.status, 'COMPLETED');
    assert.equal(summary.body.data.latestAssessment, null);
    assert.equal(summary.body.data.resident.name, resident.name);
    assert.deepEqual(summary.body.data.documentCounts, { required: 0, uploaded: 0, verified: 0, rejected: 0 });
    assert.deepEqual(summary.body.data.requiredDocuments, []);
    assert.ok(summary.body.data.validation.errors.every((error) => !error.field.startsWith('documents.')), 'Optional documents create no validation errors');
    assert.equal((await call('POST', `/move-requests/${approved.id}/comments/admin`, { adminId: admin.id, comment: 'Recorded for the resident.' })).status, 201);
    fail(await call('POST', `/move-requests/${approved.id}/comments/admin`, { adminId: outside.id, comment: 'Not allowed' }), 403, 'adminId');
    // Raw calls intentionally bypass fixtureIdentity: prove scope checks happen
    // in Express, not just in the frontend or the test convenience helper.
    const raw = async (method, path, headers = {}, body) => {
      const response = await fetch(base + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const stranger = await Resident.findOne({ where: { communityId: outside.communityId } });
    for (const suffix of ['', '/progress', '/documents', '/comments', '/checklist', '/status-history']) {
      fail(await raw('GET', `/move-requests/${draft.id}${suffix}`), 400, 'residentId');
      fail(await raw('GET', `/move-requests/${draft.id}${suffix}`, { 'X-Resident-Id': stranger.id }), 403, 'residentId');
    }
    fail(await raw('PATCH', `/move-requests/${draft.id}`, { 'X-Resident-Id': stranger.id }, { notes: 'Not mine' }), 403, 'residentId');
    fail(await raw('POST', `/move-requests/${draft.id}/submit`, { 'X-Resident-Id': stranger.id }), 403, 'residentId');
    fail(await raw('POST', `/move-requests/${draft.id}/documents`, { 'X-Resident-Id': stranger.id }, { documentType: 'IDENTITY_DOCUMENT', fileUrl: 'https://example.test/id.pdf' }), 403, 'residentId');
    fail(await raw('GET', `/admin/communities/${resident.communityId}/dashboard`, { 'X-Admin-Id': outside.id }), 403, 'adminId');
    fail(await raw('GET', `/admin/move-requests/${draft.id}`, { 'X-Admin-Id': outside.id }), 403, 'adminId');
    for (const state of ['DRAFT', 'SUBMITTED', 'NEEDS_CHANGES', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED']) {
      const move = await MoveRequest.create({ ...values, status: state });
      const cancelled = await call('POST', `/move-requests/${move.id}/cancel`, { residentId: resident.id, reason: 'Plans changed.' });
      if (['DRAFT', 'SUBMITTED', 'NEEDS_CHANGES'].includes(state)) {
        assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
        assert.equal((await move.reload()).status, 'CANCELLED');
        assert.equal(await StatusHistory.count({ where: { moveRequestId: move.id, fromStatus: state, toStatus: 'CANCELLED' } }), 1);
        assert.equal(await AuditLog.count({ where: { moveRequestId: move.id, action: 'MOVE_REQUEST_CANCELLED' } }), 1);
        assert.ok(await Notification.count({ where: { moveRequestId: move.id, recipientType: 'ADMIN' } }));
        fail(await call('PATCH', `/move-requests/${move.id}`, { notes: 'Cannot edit' }), 409, 'status');
        fail(await call('POST', `/move-requests/${move.id}/submit`), 409, 'status');
      } else fail(cancelled, 409, 'status');
    }
    fail(await call('POST', `/move-requests/${draft.id}/cancel`, { residentId: stranger.id, reason: 'Not mine.' }), 403, 'residentId');
    fail(await call('POST', `/move-requests/${draft.id}/cancel`, { residentId: resident.id, reason: ' ' }), 400, 'reason');
    Notification.create = async () => { throw new Error('Cancellation notification failure'); };
    try { assert.equal((await call('POST', `/move-requests/${draft.id}/cancel`, { residentId: resident.id, reason: 'Rollback' })).status, 500); }
    finally { Notification.create = create; }
    assert.equal((await draft.reload()).status, 'DRAFT');
    for (const model of [StatusHistory, AuditLog, Notification]) assert.equal(await model.count({ where: { moveRequestId: draft.id } }), 0);
    const directory = await call('GET', '/demo/identities');
    assert.equal(directory.status, 200);
    assert.ok(directory.body.data.residents.some((item) => item.id === resident.id && item.community.name && item.unit.unitNumber));
    console.log('PASS: raw HTTP ownership/community guards, cancellation state matrix, cancellation rollback, terminal edit protection and live demo identities');
    console.log('PASS: completion authorization, transitions, reviewer preservation, atomic rollback, summary and admin-comment alias');
  });
}
module.exports = { verifyAdminFrontendApi };
if (require.main === module) verifyAdminFrontendApi().catch((error) => { console.error(error); process.exitCode = 1; });
