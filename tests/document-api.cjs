const assert = require('node:assert/strict');
const { fixtureIdentity } = require('./fixture-identity.cjs');
const { randomUUID } = require('node:crypto');

async function verifyDocumentApi() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const { seeder } = require('../dist/seeders/runner');
  const { app } = require('../dist/app');
  const { Community, Resident, Admin, MoveRequest, Document, AuditLog, RequestComment, CommunityWorkflowConfig } = require('../dist/models');
  const queryInterface = sequelize.getQueryInterface();
  let server;
  let ownsDatabase = false;
  try {
    assert.equal((await queryInterface.showAllTables()).length, 0, 'Document API tests refuse an existing database');
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
    const resident = await Resident.findOne({ where: { communityId: green.id } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const newRequest = (status = 'DRAFT') => MoveRequest.create({
      residentId: resident.id, communityId: resident.communityId, unitId: resident.unitId,
      type: 'MOVE_IN', status, requestedDate: null, requestedTimeSlot: null,
    });
    const request = await newRequest();
    const documentsPath = (id) => `/move-requests/${id}/documents`;
    const path = documentsPath(request.id);
    const body = { documentType: 'COMMUNITY_CUSTOM_FORM', fileUrl: 'https://example.test/custom.pdf' };
    const add = async (id = request.id, input = body) => {
      const result = await call('POST', documentsPath(id), input);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.data.status, 'PENDING');
      assert.equal(result.body.data.verifiedBy, null);
      assert.equal(result.body.data.verifiedAt, null);
      assert.ok(result.body.data.uploadedAt);
      return result.body.data;
    };
    const decide = (action, id, documentId, input = { adminId: admin.id }) => call('POST', `/admin/move-requests/${id}/documents/${documentId}/${action}`, input);
    const beforeAdd = Date.now();
    assert.deepEqual((await call('GET', path)).body.data, []);
    const first = await add();
    assert.ok(Date.parse(first.uploadedAt) >= beforeAdd);
    assert.equal(first.moveRequestId, request.id);
    const addAudit = await AuditLog.findOne({ where: { moveRequestId: request.id, action: 'DOCUMENT_ADDED' } });
    assert.equal(addAudit.actorType, 'RESIDENT');
    assert.equal(addAudit.actorId, resident.id);
    assert.equal(addAudit.previousValue, null);
    assert.equal(addAudit.newValue.id, first.id);
    assert.equal(addAudit.newValue.documentType, body.documentType);
    const second = await add(request.id, { documentType: 'ANOTHER_CUSTOM_TYPE', fileUrl: 'local-test-file-reference' });
    const other = await newRequest();
    const otherDoc = await add(other.id);
    const list = await call('GET', path);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 2);
    assert.ok(list.body.data.every((row) => row.moveRequestId === request.id));
    assert.equal(list.body.data[0].id, second.id);
    assert.ok(list.body.data[0].uploadedAt >= list.body.data[1].uploadedAt);

    fail(await call('GET', documentsPath(randomUUID())), 404, 'id');
    fail(await call('POST', documentsPath(randomUUID()), body), 404, 'id');
    fail(await call('GET', '/move-requests/1/documents'), 400, 'id');
    for (const [input, field] of [
      [{}, 'documentType'], [{ ...body, documentType: '' }, 'documentType'],
      [{ ...body, documentType: ' ' }, 'documentType'], [{ ...body, documentType: 1 }, 'documentType'],
      [{ ...body, documentType: 'x'.repeat(101) }, 'documentType'], [{ documentType: 'ANY' }, 'fileUrl'],
      [{ ...body, fileUrl: ' ' }, 'fileUrl'], [{ ...body, fileUrl: false }, 'fileUrl'],
      [{ ...body, fileUrl: {} }, 'fileUrl'], [{ ...body, fileUrl: null }, 'fileUrl'],
      [{ ...body, fileUrl: '\0' }, 'body'],
    ]) fail(await call('POST', path, input), 400, field);
    for (const [field, value] of Object.entries({ status: 'VERIFIED', verifiedBy: admin.id, verifiedAt: new Date().toISOString(), uploadedAt: new Date().toISOString(), moveRequestId: other.id, residentId: resident.id, id: randomUUID() })) {
      fail(await call('POST', path, { ...body, [field]: value }), 400, field);
      fail(await call('PATCH', `${path}/${first.id}`, { fileUrl: body.fileUrl, [field]: value }), 400, field);
    }
    fail(await call('PATCH', `${path}/${first.id}`, { documentType: 'NEW_TYPE', fileUrl: body.fileUrl }), 400, 'documentType');
    fail(await call('PATCH', `${path}/${first.id}`, {}), 400, 'fileUrl');
    fail(await call('PATCH', `${path}/${first.id}`, { fileUrl: '' }), 400, 'fileUrl');
    fail(await call('DELETE', `${path}/${first.id}`, { status: 'VERIFIED' }), 400, 'status');
    for (const [method, input] of [['PATCH', { fileUrl: 'replacement' }], ['DELETE', undefined]]) {
      fail(await call(method, `${path}/${otherDoc.id}`, input), 404, 'documentId');
      fail(await call(method, `${path}/${randomUUID()}`, input), 404, 'documentId');
      fail(await call(method, `${path}/1`, input), 400, 'documentId');
      fail(await call(method, `${documentsPath(randomUUID())}/${first.id}`, input), 404, 'id');
    }
    for (const name of ['verify', 'reject']) {
      const input = { adminId: admin.id, ...(name === 'reject' ? { reason: 'Document is unclear.' } : {}) };
      fail(await decide(name, request.id, first.id, { ...input, adminId: outsideAdmin.id }), 403, 'adminId');
      fail(await decide(name, request.id, first.id, { ...input, adminId: randomUUID() }), 404, 'adminId');
      fail(await decide(name, request.id, first.id, { ...input, adminId: 1 }), 400, 'adminId');
      fail(await decide(name, request.id, first.id, { ...input, adminId: undefined }), 400, 'adminId');
      fail(await decide(name, request.id, otherDoc.id, input), 404, 'documentId');
      fail(await decide(name, request.id, randomUUID(), input), 404, 'documentId');
      fail(await decide(name, randomUUID(), first.id, input), 404, 'id');
      fail(await decide(name, request.id, '1', input), 400, 'documentId');
      fail(await decide(name, request.id, first.id, { ...input, status: 'VERIFIED' }), 400, 'status');
    }
    for (const reason of [undefined, null, '', '  ', 1, []]) {
      fail(await decide('reject', request.id, first.id, { adminId: admin.id, reason }), 400, 'reason');
    }
    assert.equal((await Document.findByPk(first.id)).status, 'PENDING');
    assert.equal(await AuditLog.count({ where: { moveRequestId: request.id } }), 2);

    const verified = await decide('verify', request.id, first.id);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.status, 'VERIFIED');
    assert.equal(verified.body.data.verifiedBy, admin.id);
    assert.ok(verified.body.data.verifiedAt);
    assert.equal(verified.body.data.uploadedAt, first.uploadedAt);
    const replaced = await call('PATCH', `${path}/${first.id}`, { fileUrl: '  https://example.test/new.pdf  ' });
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body.data.fileUrl, 'https://example.test/new.pdf');
    assert.equal(replaced.body.data.status, 'PENDING');
    assert.equal(replaced.body.data.verifiedBy, null);
    assert.equal(replaced.body.data.verifiedAt, null);
    assert.ok(replaced.body.data.uploadedAt > first.uploadedAt);
    assert.equal(replaced.body.data.documentType, body.documentType);
    assert.equal((await call('GET', path)).body.data[0].id, first.id);
    const updateAudit = await AuditLog.findOne({ where: { moveRequestId: request.id, action: 'DOCUMENT_UPDATED' } });
    assert.equal(updateAudit.previousValue.status, 'VERIFIED');
    assert.equal(updateAudit.newValue.status, 'PENDING');
    assert.equal(updateAudit.previousValue.fileUrl, body.fileUrl);
    assert.equal(updateAudit.newValue.verifiedAt, null);
    const reason = 'Document is unclear.';
    const rejected = await decide('reject', request.id, first.id, { adminId: admin.id, reason: ` ${reason} ` });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.status, 'REJECTED');
    assert.equal(rejected.body.data.verifiedBy, admin.id);
    const rejectAudit = await AuditLog.findOne({ where: { moveRequestId: request.id, action: 'DOCUMENT_REJECTED' } });
    assert.equal(rejectAudit.actorType, 'ADMIN');
    assert.equal(rejectAudit.actorId, admin.id);
    assert.equal(rejectAudit.metadata.reason, reason);
    assert.equal(rejectAudit.metadata.documentId, first.id);
    const comment = await RequestComment.findOne({ where: { moveRequestId: request.id } });
    assert.equal(comment.authorType, 'ADMIN');
    assert.equal(comment.authorId, admin.id);
    assert.ok(comment.comment.includes(reason));
    assert.ok(comment.comment.includes(first.id));

    const deleted = await call('DELETE', `${path}/${second.id}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body, { success: true, data: { id: second.id } });
    assert.equal(await Document.findByPk(second.id), null);
    const deleteAudit = await AuditLog.findOne({ where: { moveRequestId: request.id, action: 'DOCUMENT_DELETED' } });
    assert.equal(deleteAudit.previousValue.id, second.id);
    assert.equal(deleteAudit.newValue, null);
    fail(await call('DELETE', `${path}/${second.id}`), 404, 'documentId');

    // Resident mutations follow the shared request-state rule. Admin verification is independent of request status.
    for (const state of ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED']) {
      const locked = await newRequest(state);
      const doc = await Document.create({ moveRequestId: locked.id, ...body });
      const lockedPath = `${documentsPath(locked.id)}/${doc.id}`;
      fail(await call('POST', documentsPath(locked.id), body), 409, 'status');
      fail(await call('PATCH', lockedPath, { fileUrl: 'replacement' }), 409, 'status');
      fail(await call('DELETE', lockedPath), 409, 'status');
      assert.equal((await call('GET', documentsPath(locked.id))).status, 200);
      assert.equal((await decide('verify', locked.id, doc.id)).status, 200);
      assert.equal((await locked.reload()).status, state);
    }
    const needsChanges = await newRequest('NEEDS_CHANGES');
    const changeDoc = await add(needsChanges.id);
    assert.equal((await call('PATCH', `${documentsPath(needsChanges.id)}/${changeDoc.id}`, { fileUrl: 'replacement' })).status, 200);
    assert.equal((await call('DELETE', `${documentsPath(needsChanges.id)}/${changeDoc.id}`)).status, 200);

    // Every mutation rolls back if its final audit insert fails, including rejection's comment and hard deletion.
    for (const mutation of ['add', 'update', 'delete', 'verify', 'reject']) {
      const target = await newRequest();
      const doc = await Document.create({ moveRequestId: target.id, ...body, status: 'VERIFIED', verifiedBy: admin.id, verifiedAt: new Date() });
      const before = doc.toJSON();
      const originalCreate = AuditLog.create;
      AuditLog.create = async () => { throw new Error('TEST_DOCUMENT_AUDIT_FAILURE'); };
      try {
        let result;
        const docPath = `${documentsPath(target.id)}/${doc.id}`;
        if (mutation === 'add') result = await call('POST', documentsPath(target.id), body);
        else if (mutation === 'update') result = await call('PATCH', docPath, { fileUrl: 'new-file' });
        else if (mutation === 'delete') result = await call('DELETE', docPath);
        else result = await decide(mutation, target.id, doc.id, { adminId: admin.id, ...(mutation === 'reject' ? { reason } : {}) });
        fail(result, 500, 'request');
      } finally { AuditLog.create = originalCreate; }
      assert.deepEqual((await Document.findByPk(doc.id)).toJSON(), before);
      assert.equal(await Document.count({ where: { moveRequestId: target.id } }), 1);
      assert.equal(await RequestComment.count({ where: { moveRequestId: target.id } }), 0);
      assert.equal(await AuditLog.count({ where: { moveRequestId: target.id } }), 0);
    }

    // Required types remain configuration-driven; rejection blocks submission until replacement or verification.
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: request.type } });
    await config.update({ requiredFields: [], requiredDocuments: [body.documentType] });
    fail(await call('POST', `/move-requests/${request.id}/submit`), 422, `documents.${body.documentType}`);
    assert.equal((await call('PATCH', `${path}/${first.id}`, { fileUrl: 'https://example.test/clear.pdf' })).status, 200);
    assert.equal((await call('POST', `/move-requests/${request.id}/submit`)).status, 200);
    const reviewPath = `/admin/move-requests/${request.id}`;
    assert.equal((await call('POST', `${reviewPath}/review`, { adminId: admin.id })).status, 200);
    assert.equal((await decide('reject', request.id, first.id, { adminId: admin.id, reason })).status, 200);
    assert.equal((await call('POST', `${reviewPath}/request-changes`, { adminId: admin.id, reason })).status, 200);
    fail(await call('POST', `/move-requests/${request.id}/submit`), 422, `documents.${body.documentType}`);
    assert.equal((await call('PATCH', `${path}/${first.id}`, { fileUrl: 'https://example.test/final.pdf' })).status, 200);
    assert.equal((await decide('verify', request.id, first.id)).body.data.status, 'VERIFIED');
    assert.equal((await call('POST', `/move-requests/${request.id}/submit`)).status, 200);
    assert.equal((await call('GET', `/move-requests/${request.id}`)).body.data.documents[0].status, 'VERIFIED');
    console.log('PASS: all six document APIs, configurable types, protected fields, request/admin scoping, replacement resets, audit/comment records, all mutation rollbacks and submission/resubmission integration');
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

module.exports = { verifyDocumentApi };
if (require.main === module) {
  verifyDocumentApi().catch((error) => { console.error(error); process.exitCode = 1; });
}
