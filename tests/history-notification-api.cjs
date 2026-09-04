const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyHistoryNotificationApi() {
  await withTestApi(async ({ sequelize, models, call, fail }) => {
    const { Community, Resident, Admin, Unit, MoveRequest, CommunityWorkflowConfig, StatusHistory, AuditLog, Notification, RequestComment } = models;
    const { createNotification } = require('../dist/services/notification.service');
    const { createAuditLog } = require('../dist/services/audit-log.service');
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const resident = await Resident.findOne({ where: { communityId: green.id } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const anotherAdmin = await Admin.create({ communityId: green.id, name: 'Local staff', email: 'staff@example.test', phone: '9000000000', role: 'STAFF' });
    const unit = await Unit.findByPk(resident.unitId);
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: 'MOVE_IN' } });
    await config.update({ requiredFields: [], requiredDocuments: [] });
    const newRequest = (status = 'DRAFT') => MoveRequest.create({
      residentId: resident.id, communityId: green.id, unitId: resident.unitId,
      type: 'MOVE_IN', status, requestedDate: null, requestedTimeSlot: null,
    });
    const request = await newRequest();
    const path = `/move-requests/${request.id}`;
    const auditPath = `/admin${path}/audit-logs`;
    const action = (name, id = request.id, reason) => call('POST', `/admin/move-requests/${id}/${name}`, { adminId: admin.id, ...(reason ? { reason } : {}) });
    assert.deepEqual((await call('GET', `${path}/status-history`)).body.data, []);
    assert.deepEqual((await call('GET', `${auditPath}?adminId=${admin.id}`)).body.data, []);
    fail(await call('GET', auditPath), 400, 'adminId');
    fail(await call('GET', `${auditPath}?adminId=${outsideAdmin.id}`), 403, 'adminId');
    fail(await call('GET', `${auditPath}?adminId=${randomUUID()}`), 404, 'adminId');
    for (const [query, field] of [
      ['adminId=1', 'adminId'], [`adminId=${admin.id}&actorType=INVALID`, 'actorType'],
      [`adminId=${admin.id}&actorType=ADMIN&actorType=RESIDENT`, 'actorType'],
      [`adminId=${admin.id}&action=`, 'action'], [`adminId=${admin.id}&action=A&action=B`, 'action'],
      [`adminId=${admin.id}&moveRequestId=${randomUUID()}`, 'moveRequestId'],
    ]) fail(await call('GET', `${auditPath}?${query}`), 400, field);
    fail(await call('GET', `/move-requests/${randomUUID()}/status-history`), 404, 'id');
    fail(await call('GET', `/admin/move-requests/${randomUUID()}/audit-logs?adminId=${admin.id}`), 404, 'id');
    fail(await call('GET', '/move-requests/1/status-history'), 400, 'id');
    for (const [recipientType, recipientId, inbox] of [
      ['RESIDENT', resident.id, `/residents/${resident.id}/notifications`],
      ['ADMIN', admin.id, `/admin/${admin.id}/notifications`],
    ]) {
      assert.deepEqual((await call('GET', inbox)).body.data, []);
      const notification = await createNotification({ recipientType, recipientId, title: 'Local test', message: 'Stored only.' });
      assert.equal(notification.status, 'PENDING');
      assert.equal(notification.channel, 'IN_APP');
      assert.equal(notification.moveRequestId, null);
      assert.equal(notification.sentAt, null);
      assert.equal((await call('GET', inbox)).body.data[0].id, notification.id);
    }
    fail(await call('GET', `/residents/${randomUUID()}/notifications`), 404, 'residentId');
    fail(await call('GET', `/admin/${randomUUID()}/notifications`), 404, 'adminId');
    fail(await call('GET', '/admin/1/notifications'), 400, 'adminId');
    fail(await call('GET', '/residents/1/notifications'), 400, 'residentId');
    const rootAudit = await createAuditLog({ actorType: 'SYSTEM', actorId: null, action: 'LOCAL_TEST', previousValue: false, newValue: 0 });
    assert.equal(rootAudit.previousValue, false);
    assert.equal(rootAudit.newValue, 0);
    assert.equal(rootAudit.metadata, null);
    assert.equal((await call('GET', `${auditPath}?adminId=${admin.id}`)).body.data.length, 0);

    // Failure on the second admin's notification rolls back the first notification and the workflow writes.
    for (const status of ['DRAFT', 'NEEDS_CHANGES']) {
      const target = await newRequest(status);
      const before = target.toJSON();
      const originalCreate = Notification.create;
      let calls = 0;
      Notification.create = async function (values, options) {
        if (++calls === 2) throw new Error('TEST_NOTIFICATION_FANOUT_FAILURE');
        return originalCreate.call(this, values, options);
      };
      try { fail(await call('POST', `/move-requests/${target.id}/submit`), 500, 'request'); }
      finally { Notification.create = originalCreate; }
      assert.equal(calls, 2);
      assert.deepEqual((await target.reload()).toJSON(), before);
      for (const model of [StatusHistory, AuditLog, Notification]) assert.equal(await model.count({ where: { moveRequestId: target.id } }), 0);
    }
    for (const name of ['approve', 'request-changes', 'reject']) {
      const target = await newRequest('UNDER_REVIEW');
      const before = target.toJSON();
      const originalCreate = Notification.create;
      Notification.create = async () => { throw new Error('TEST_RESIDENT_NOTIFICATION_FAILURE'); };
      try { fail(await action(name, target.id, name === 'approve' ? undefined : 'Correct your dates.'), 500, 'request'); }
      finally { Notification.create = originalCreate; }
      assert.deepEqual((await target.reload()).toJSON(), before);
      for (const model of [StatusHistory, AuditLog, Notification, RequestComment]) assert.equal(await model.count({ where: { moveRequestId: target.id } }), 0);
    }
    assert.equal((await call('POST', `${path}/submit`)).status, 200);
    let notifications = await Notification.findAll({ where: { moveRequestId: request.id } });
    assert.deepEqual(notifications.map((row) => row.recipientId).sort(), [admin.id, anotherAdmin.id].sort());
    assert.ok(notifications.every((row) => row.message.includes(`Unit ${unit.unitNumber}`)));
    fail(await call('POST', `${path}/submit`), 409, 'status');
    assert.equal(await Notification.count({ where: { moveRequestId: request.id } }), 2);
    assert.equal((await action('review')).status, 200);
    assert.equal(await Notification.count({ where: { moveRequestId: request.id } }), 2, 'Starting review alone sends no notification');
    const reason = 'Please verify your move date.';
    assert.equal((await action('request-changes', request.id, reason)).status, 200);
    const changes = await Notification.findOne({ where: { moveRequestId: request.id, recipientType: 'RESIDENT' } });
    assert.equal(changes.recipientId, resident.id);
    assert.ok(changes.message.includes(reason));
    assert.equal((await call('POST', `${path}/submit`)).status, 200);
    assert.equal(await Notification.count({ where: { moveRequestId: request.id, recipientType: 'ADMIN' } }), 4);
    assert.equal((await action('review')).status, 200);
    assert.equal((await action('approve')).status, 200);
    assert.equal(await Notification.count({ where: { moveRequestId: request.id, recipientType: 'RESIDENT' } }), 2);
    const rejected = await newRequest('UNDER_REVIEW');
    assert.equal((await action('reject', rejected.id, reason)).status, 200);
    assert.ok((await Notification.findOne({ where: { moveRequestId: rejected.id } })).message.includes(reason));
    for (const [inbox, type, id] of [
      [`/residents/${resident.id}/notifications`, 'RESIDENT', resident.id],
      [`/admin/${admin.id}/notifications`, 'ADMIN', admin.id],
    ]) {
      const rows = (await call('GET', inbox)).body.data;
      assert.ok(rows.every((row) => row.recipientId === id && row.recipientType === type && row.status === 'PENDING' && row.sentAt === null));
      for (let i = 1; i < rows.length; i++) assert.ok(rows[i].createdAt <= rows[i - 1].createdAt);
    }
    assert.deepEqual((await call('GET', `/admin/${outsideAdmin.id}/notifications`)).body.data, []);
    const histories = (await call('GET', `${path}/status-history`)).body.data;
    assert.equal(histories.length, 6);
    for (const row of histories) for (const field of ['fromStatus', 'toStatus', 'changedByType', 'changedById', 'reason', 'createdAt']) assert.ok(field in row);
    for (let i = 1; i < histories.length; i++) assert.ok(histories[i].createdAt >= histories[i - 1].createdAt);
    const logs = (await call('GET', `${auditPath}?adminId=${admin.id}`)).body.data;
    assert.equal(logs.length, 6);
    for (let i = 1; i < logs.length; i++) assert.ok(logs[i].createdAt <= logs[i - 1].createdAt);
    const filtered = (await call('GET', `${auditPath}?adminId=${admin.id}&actorType=RESIDENT&action=MOVE_REQUEST_SUBMITTED`)).body.data;
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((row) => row.moveRequestId === request.id && row.actorType === 'RESIDENT' && row.action === 'MOVE_REQUEST_SUBMITTED'));
    assert.deepEqual((await call('GET', `${auditPath}?adminId=${admin.id}&action=UNKNOWN_ACTION`)).body.data, []);
    for (const method of ['PATCH', 'DELETE']) {
      fail(await call(method, `${path}/status-history`), 404, 'path');
      fail(await call(method, auditPath), 404, 'path');
    }
    await assert.rejects(sequelize.query('UPDATE status_histories SET reason = reason WHERE "moveRequestId" = :id', { replacements: { id: request.id } }), /append.only/i);
    await assert.rejects(sequelize.query('DELETE FROM audit_logs WHERE "moveRequestId" = :id', { replacements: { id: request.id } }), /append.only/i);
    console.log('PASS: history/audit authorization, filtering/order, append-only enforcement, notification reads/defaults, all workflow notifications, fanout isolation and transactional notification-failure rollback');
  });
}
module.exports = { verifyHistoryNotificationApi };
if (require.main === module) verifyHistoryNotificationApi().catch((error) => { console.error(error); process.exitCode = 1; });
