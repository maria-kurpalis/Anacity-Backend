const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

async function verifyAgentTracking({ sequelize, request, resident }) {
  const {
    AgentConversation, AgentAssessment, AuditLog, StatusHistory, Notification, AgentToolExecution,
    AgentConversationRole, AgentAssessmentRecommendation, ActorType, MoveRequestStatus,
    NotificationRecipientType, NotificationChannel, NotificationStatus, AgentToolExecutionStatus,
  } = require('../dist/models');
  const data = [
    [AgentConversation, { moveRequestId: request.id, role: AgentConversationRole.USER, message: 'When can I move?', metadata: { source: 'chat', tags: ['move'], extra: null } }],
    [AgentAssessment, { moveRequestId: request.id, recommendation: AgentAssessmentRecommendation.MANUAL_REVIEW, confidence: 0.85, reasoning: 'Needs review', issues: [{ field: 'documents', missing: true }] }],
    [AuditLog, { moveRequestId: request.id, actorType: ActorType.RESIDENT, actorId: resident.id, action: 'STATUS_CHANGED', previousValue: 'DRAFT', newValue: 'SUBMITTED', metadata: { origin: 'test' } }],
    [StatusHistory, { moveRequestId: request.id, fromStatus: null, toStatus: MoveRequestStatus.DRAFT, changedByType: ActorType.SYSTEM, changedById: null, reason: null }],
    [Notification, { moveRequestId: request.id, recipientType: NotificationRecipientType.RESIDENT, recipientId: resident.id, channel: NotificationChannel.IN_APP, title: 'Request received', message: 'Your request was received.' }],
    [AgentToolExecution, { moveRequestId: request.id, toolName: 'validate_fields', input: { fields: ['name'] }, output: true, status: AgentToolExecutionStatus.SUCCESS }],
  ];
  const instances = [];
  for (const [model, values] of data) {
    const row = await model.create(values);
    await row.reload();
    instances.push(row);
    assert.ok(row.createdAt instanceof Date);
    const loaded = await model.findByPk(row.id, { include: ['moveRequest'] });
    assert.equal(loaded.moveRequest.id, request.id);
    await assert.rejects(model.create({ ...values, moveRequestId: randomUUID() }), (error) => error.original?.code === '23503');
  }
  const [conversation, assessment, audit, history, notification, execution] = instances;
  assert.deepEqual(conversation.metadata, data[0][1].metadata);
  assert.deepEqual(assessment.issues, data[1][1].issues);
  assert.equal(typeof assessment.confidence, 'number');
  assert.ok(Math.abs(assessment.confidence - 0.85) < 0.000001);
  assert.equal(audit.previousValue, 'DRAFT');
  assert.equal(audit.newValue, 'SUBMITTED');
  assert.deepEqual(audit.metadata, { origin: 'test' });
  assert.deepEqual(execution.input, { fields: ['name'] });
  assert.equal(execution.output, true);
  assert.equal(execution.errorMessage, null);
  assert.equal(notification.status, NotificationStatus.PENDING);
  assert.equal(notification.sentAt, null);
  assert.equal(history.fromStatus, null);
  assert.equal(history.changedById, null);
  assert.equal(history.reason, null);

  for (const [model, values] of [
    [AgentConversation, { moveRequestId: request.id, role: AgentConversationRole.AGENT, message: 'Please upload your documents.' }],
    [AgentAssessment, { moveRequestId: request.id, recommendation: AgentAssessmentRecommendation.REQUEST_CHANGES, reasoning: 'Missing documents' }],
  ]) {
    const row = await model.create(values);
    await row.reload();
    if (model === AgentConversation) assert.equal(row.metadata, null);
    else { assert.equal(row.confidence, null); assert.equal(row.issues, null); }
    assert.equal(await model.count({ where: { moveRequestId: request.id } }), 2, 'Multiple history rows must be retained');
    await assert.rejects(model.create({ ...values, moveRequestId: null }), { name: 'SequelizeValidationError' });
  }

  // Nullable request references allow global records, including an absent actor ID.
  for (const [model, values] of [
    [AuditLog, { actorType: ActorType.SYSTEM, action: 'MAINTENANCE' }],
    [Notification, { recipientType: NotificationRecipientType.ADMIN, recipientId: randomUUID(), channel: NotificationChannel.EMAIL, title: 'Notice', message: 'System notice' }],
    [AgentToolExecution, { toolName: 'check_health', status: AgentToolExecutionStatus.FAILED }],
  ]) {
    const row = await model.create(values);
    const loaded = await model.findByPk(row.id, { include: ['moveRequest'] });
    assert.equal(loaded.moveRequestId, null);
    assert.equal(loaded.moveRequest, null);
    if (model === AuditLog) for (const field of ['actorId', 'previousValue', 'newValue', 'metadata']) assert.equal(loaded[field], null);
    if (model === AgentToolExecution) for (const field of ['input', 'output', 'errorMessage']) assert.equal(loaded[field], null);
  }

  const aliases = ['agentConversations', 'agentAssessments', 'auditLogs', 'statusHistories', 'notifications', 'agentToolExecutions'];
  const loadedRequest = await request.constructor.findByPk(request.id, { include: aliases });
  for (let i = 0; i < aliases.length; i++) {
    assert.ok(loadedRequest[aliases[i]].some((row) => row.id === instances[i].id), aliases[i]);
  }
  const [jsonColumns] = await sequelize.query("SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('agent_conversations', 'agent_assessments', 'audit_logs', 'agent_tool_executions') AND column_name IN ('metadata', 'issues', 'previousValue', 'newValue', 'input', 'output')");
  assert.equal(jsonColumns.length, 7);
  for (const column of jsonColumns) assert.equal(column.data_type, 'jsonb');
  for (const model of [AuditLog, StatusHistory, AgentToolExecution]) {
    assert.equal(model.getAttributes().updatedAt, undefined);
    assert.equal((await sequelize.getQueryInterface().describeTable(model.getTableName())).updatedAt, undefined);
  }

  // Exercise all enum values using inserts, so immutable records never need updates.
  for (const [position, field, enumeration] of [
    [0, 'role', AgentConversationRole], [1, 'recommendation', AgentAssessmentRecommendation],
    [2, 'actorType', ActorType], [3, 'fromStatus', MoveRequestStatus], [3, 'toStatus', MoveRequestStatus],
    [3, 'changedByType', ActorType], [4, 'recipientType', NotificationRecipientType],
    [4, 'channel', NotificationChannel], [4, 'status', NotificationStatus], [5, 'status', AgentToolExecutionStatus],
  ]) {
    const [model, values] = data[position];
    for (const value of Object.values(enumeration)) await model.create({ ...values, [field]: value });
    await assert.rejects(model.create({ ...values, [field]: 'INVALID' }, { validate: false }), (error) => error.original?.code === '22P02');
  }

  const [rawNotification] = await sequelize.query('INSERT INTO notifications ("recipientType", "recipientId", channel, title, message) VALUES ($1, $2, $3, $4, $5) RETURNING *', { bind: ['RESIDENT', resident.id, 'EMAIL', 'Notice', 'Hello'] });
  assert.equal(rawNotification[0].status, 'PENDING');
  assert.equal(rawNotification[0].sentAt, null);
  assert.ok(rawNotification[0].createdAt instanceof Date);
  await notification.update({ status: NotificationStatus.SENT, sentAt: new Date() });
  await notification.reload();
  assert.equal(notification.status, NotificationStatus.SENT);
  assert.ok(notification.sentAt instanceof Date);

  // Migration triggers enforce append-only for ORM, bulk operations, upsert and raw SQL.
  const immutable = (error) => error.original?.code === '55000';
  for (const [model, row, field, replacement] of [
    [AuditLog, audit, 'action', 'TAMPERED'],
    [StatusHistory, history, 'reason', 'TAMPERED'],
  ]) {
    const before = row.toJSON();
    const count = await model.count();
    await assert.rejects(row.update({ [field]: replacement }), immutable);
    await assert.rejects(row.destroy(), immutable);
    await assert.rejects(model.update({ [field]: replacement }, { where: { id: row.id } }), immutable);
    await assert.rejects(model.destroy({ where: { id: row.id } }), immutable);
    await assert.rejects(model.upsert({ ...before, [field]: replacement }), immutable);
    const table = model.getTableName();
    for (const sql of [`UPDATE "${table}" SET "${field}" = 'TAMPERED'`, `DELETE FROM "${table}"`, `TRUNCATE TABLE "${table}"`]) {
      await assert.rejects(sequelize.query(sql), immutable);
    }
    assert.deepEqual((await row.reload()).toJSON(), before);
    assert.equal(await model.count(), count);
  }
  await assert.rejects(request.destroy(), (error) => ['23503', '23001'].includes(error.original?.code));
}

module.exports = { verifyAgentTracking };
