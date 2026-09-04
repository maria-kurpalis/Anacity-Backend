const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

async function verifyRequestExtensions({ sequelize, community, request, admin }) {
  const {
    MoveRequestDetails, Document, CommunityWorkflowConfig, RequestChecklist, RequestComment,
    DocumentStatus, ChecklistStatus, ChecklistCompletedByType, CommentAuthorType, MoveRequestType,
  } = require('../dist/models');
  const foreignKeyError = (error) => ['23503', '23001'].includes(error.original?.code);
  const detailsData = {
    moveRequestId: request.id, movingCompany: 'Test Movers', vehicleCount: 1,
    vehicleDetails: [{ plate: 'TEST-01', attributes: { lift: true, capacity: 3, note: null } }],
    occupantCount: 2, notes: 'Use the loading bay',
  };
  const details = await MoveRequestDetails.create(detailsData);
  const documentData = { moveRequestId: request.id, documentType: 'LEASE', fileUrl: 'https://example.test/lease.pdf' };
  const document = await Document.create(documentData);
  await document.reload();
  assert.equal(document.status, DocumentStatus.PENDING);
  assert.equal(document.verifiedBy, null);
  assert.equal(document.verifiedAt, null);
  assert.ok(document.uploadedAt instanceof Date);
  await document.update({ verifiedBy: admin.id, verifiedAt: new Date(), status: DocumentStatus.VERIFIED });

  const workflowData = {
    communityId: community.id, requestType: MoveRequestType.MOVE_IN,
    requiredFields: ['movingCompany', 'occupantCount'],
    requiredDocuments: [{ type: 'LEASE', required: true }],
    allowedDays: { weekdays: [1, 2, 3, 4, 5] },
    allowedTimeSlots: [{ start: '09:00', end: '11:00' }],
    instructions: 'Check in at reception',
  };
  const workflow = await CommunityWorkflowConfig.create(workflowData);
  await CommunityWorkflowConfig.create({ ...workflowData, requestType: MoveRequestType.MOVE_OUT });
  const checklistData = { moveRequestId: request.id, key: 'DOCUMENTS_CHECKED', label: 'Check documents' };
  const checklist = await RequestChecklist.create(checklistData);
  await checklist.reload();
  assert.equal(checklist.status, ChecklistStatus.PENDING);
  for (const field of ['completedByType', 'completedById', 'completedAt']) assert.equal(checklist[field], null);
  const commentData = { moveRequestId: request.id, authorType: CommentAuthorType.RESIDENT, comment: 'Please confirm the time.' };
  const comment = await RequestComment.create(commentData);
  await comment.reload();
  assert.equal(comment.authorId, null);

  // Verify nested objects and arrays survive a database round trip.
  await details.reload();
  await workflow.reload();
  assert.deepEqual(details.vehicleDetails, detailsData.vehicleDetails);
  for (const field of ['requiredFields', 'requiredDocuments', 'allowedDays', 'allowedTimeSlots']) {
    assert.deepEqual(workflow[field], workflowData[field]);
  }
  const [jsonColumns] = await sequelize.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('vehicleDetails', 'requiredFields', 'requiredDocuments', 'allowedDays', 'allowedTimeSlots')");
  assert.equal(jsonColumns.length, 5);
  for (const column of jsonColumns) assert.equal(column.data_type, 'jsonb');

  for (const instance of [details, document, workflow, checklist, comment]) {
    for (const association of Object.values(instance.constructor.associations)) {
      const loaded = await instance.constructor.findByPk(instance.id, { include: [association] });
      assert.ok(loaded.get(association.as), `${instance.constructor.name}.${association.as} must load`);
    }
  }
  const loadedRequest = await request.constructor.findByPk(request.id, { include: ['details', 'documents', 'checklistItems', 'comments'] });
  assert.equal(loadedRequest.details.id, details.id);
  assert.ok(loadedRequest.documents.some((row) => row.id === document.id));
  assert.ok(loadedRequest.checklistItems.some((row) => row.id === checklist.id));
  assert.ok(loadedRequest.comments.some((row) => row.id === comment.id));
  const loadedCommunity = await community.constructor.findByPk(community.id, { include: ['workflowConfigs'] });
  assert.equal(loadedCommunity.workflowConfigs.length, 2);
  const loadedAdmin = await admin.constructor.findByPk(admin.id, { include: ['verifiedDocuments'] });
  assert.ok(loadedAdmin.verifiedDocuments.some((row) => row.id === document.id));

  for (const [model, values] of [[MoveRequestDetails, detailsData], [Document, documentData], [RequestChecklist, checklistData], [RequestComment, commentData]]) {
    await assert.rejects(model.create({ ...values, moveRequestId: randomUUID() }), foreignKeyError);
  }
  await assert.rejects(Document.create({ ...documentData, verifiedBy: randomUUID() }), foreignKeyError);
  await assert.rejects(CommunityWorkflowConfig.create({ ...workflowData, communityId: randomUUID() }), foreignKeyError);
  await assert.rejects(MoveRequestDetails.create(detailsData), { name: 'SequelizeUniqueConstraintError' });
  await assert.rejects(CommunityWorkflowConfig.create(workflowData), { name: 'SequelizeUniqueConstraintError' });
  await assert.rejects(RequestChecklist.create(checklistData), { name: 'SequelizeUniqueConstraintError' });

  // Raw SQL proves checks/defaults are enforced independently of ORM validation.
  for (const field of ['vehicleCount', 'occupantCount']) {
    await assert.rejects(sequelize.query(`UPDATE move_request_details SET "${field}" = -1`), (error) => error.original?.code === '23514');
  }
  for (const [table, field] of [
    ['documents', 'status'], ['community_workflow_configs', 'requestType'],
    ['request_checklists', 'status'], ['request_checklists', 'completedByType'], ['request_comments', 'authorType'],
  ]) {
    await assert.rejects(sequelize.query(`UPDATE "${table}" SET "${field}" = 'INVALID'`), (error) => error.original?.code === '22P02');
  }
  const [rawDocuments] = await sequelize.query('INSERT INTO documents ("moveRequestId", "documentType", "fileUrl") VALUES ($1, $2, $3) RETURNING *', { bind: [request.id, 'ID', 'https://example.test/id.pdf'] });
  assert.equal(rawDocuments[0].status, DocumentStatus.PENDING);
  assert.ok(rawDocuments[0].uploadedAt instanceof Date);
  assert.match(rawDocuments[0].id, /^[0-9a-f-]{36}$/);
  const [rawChecklist] = await sequelize.query('INSERT INTO request_checklists ("moveRequestId", "key", "label") VALUES ($1, $2, $3) RETURNING *', { bind: [request.id, 'RAW_ITEM', 'Raw item'] });
  assert.equal(rawChecklist[0].status, ChecklistStatus.PENDING);
  assert.equal(rawChecklist[0].completedById, null);

  for (const status of Object.values(DocumentStatus)) await document.update({ status });
  for (const status of Object.values(ChecklistStatus)) await checklist.update({ status });
  for (const completedByType of Object.values(ChecklistCompletedByType)) {
    await checklist.update({ completedByType, completedById: randomUUID(), completedAt: new Date() });
  }
  for (const authorType of Object.values(CommentAuthorType)) await comment.update({ authorType, authorId: randomUUID() });
  await assert.rejects(request.destroy(), foreignKeyError);
  return { document };
}

module.exports = { verifyRequestExtensions };
