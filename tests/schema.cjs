const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { verifyRequestExtensions } = require('./request-extensions.cjs');
const { verifyAgentTracking } = require('./agent-tracking.cjs');
const { verifySeeds } = require('./seeds.cjs');

async function verifySchema() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated, empty PostgreSQL test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const {
    Community, Unit, Resident, Admin, MoveRequest,
    MoveRequestDetails, Document, CommunityWorkflowConfig, RequestChecklist, RequestComment,
    AgentConversation, AgentAssessment, AuditLog, StatusHistory, Notification, AgentToolExecution,
    ResidentType, AdminRole, MoveRequestType, MoveRequestStatus,
  } = require('../dist/models');
  const queryInterface = sequelize.getQueryInterface();
  let ownsSchema = false;

  try {
    assert.equal((await queryInterface.showAllTables()).length, 0, 'Test database must be empty; refusing to modify existing tables');
    ownsSchema = true;
    assert.equal((await migrator.pending()).length, 19);
    await migrator.up({ to: '202609020005-create-move-requests.js' });
    const existingCommunity = await Community.create({ name: 'Existing community', code: 'EXISTING', address: 'Existing address' });
    await migrator.up({ to: '202609020010-create-request-comments.js' });
    const existingWorkflow = await CommunityWorkflowConfig.create({
      communityId: existingCommunity.id, requestType: MoveRequestType.MOVE_IN,
      requiredFields: ['movingCompany', 'notes'], requiredDocuments: ['IDENTITY_DOCUMENT', 'TENANCY_AGREEMENT', 'OWNER_AUTHORIZATION'], allowedDays: [], allowedTimeSlots: [], instructions: 'Existing workflow',
    });
    await migrator.up();
    await existingWorkflow.reload();
    assert.deepEqual(existingWorkflow.requiredFields, ['notes']);
    assert.deepEqual(existingWorkflow.requiredDocuments, ['IDENTITY_DOCUMENT', 'OWNER_AUTHORIZATION']);
    assert.equal((await migrator.executed()).length, 19);
    assert.equal((await existingCommunity.reload()).code, 'EXISTING', 'Upgrade must preserve existing data');
    assert.equal((await existingWorkflow.reload()).instructions, 'Existing workflow');
    assert.equal((await migrator.up()).length, 0, 'Applying migrations again must be a no-op');

    // Compare actual migrated columns and indexes with the application definitions.
    for (const model of [
      Community, Unit, Resident, Admin, MoveRequest,
      MoveRequestDetails, Document, CommunityWorkflowConfig, RequestChecklist, RequestComment,
      AgentConversation, AgentAssessment, AuditLog, StatusHistory, Notification, AgentToolExecution,
    ]) {
      const columns = await queryInterface.describeTable(model.getTableName());
      assert.deepEqual(Object.keys(columns).sort(), Object.keys(model.getAttributes()).sort());
      for (const [name, attribute] of Object.entries(model.getAttributes())) {
        assert.equal(columns[name].allowNull, attribute.allowNull, `${model.name}.${name} nullability`);
      }
      const indexNames = (await queryInterface.showIndex(model.getTableName())).map((index) => index.name);
      for (const index of model.options.indexes) assert.ok(indexNames.includes(index.name), index.name);
    }

    const community = await Community.create({ name: 'Community A', code: 'TEST-A', address: 'Address A' });
    const otherCommunity = await Community.create({ name: 'Community B', code: 'TEST-B', address: 'Address B' });
    const unit = await Unit.create({ communityId: community.id, unitNumber: '101', tower: 'A', floor: 1 });
    const otherUnit = await Unit.create({ communityId: community.id, unitNumber: '102', tower: 'A', floor: 1 });
    const foreignUnit = await Unit.create({ communityId: otherCommunity.id, unitNumber: '101', tower: 'A', floor: 1 });
    const residentData = { communityId: community.id, unitId: unit.id, name: 'Resident', email: 'resident@example.test', phone: '+10000000000', residentType: ResidentType.OWNER };
    const resident = await Resident.create(residentData);
    const adminData = { communityId: community.id, name: 'Admin', email: 'admin@example.test', phone: '+10000000001', role: AdminRole.ADMIN };
    const admin = await Admin.create(adminData);
    const foreignAdmin = await Admin.create({ ...adminData, communityId: otherCommunity.id });
    const requestData = { communityId: community.id, unitId: unit.id, residentId: resident.id, type: MoveRequestType.MOVE_IN, requestedDate: '2026-09-10', requestedTimeSlot: '09:00-11:00' };
    const request = await MoveRequest.create(requestData);
    await request.reload();
    assert.equal(request.status, MoveRequestStatus.DRAFT);
    assert.equal(request.requestedDate, '2026-09-10');
    for (const field of ['submittedAt', 'reviewedBy', 'reviewedAt', 'rejectionReason']) assert.equal(request[field], null);
    assert.equal(community.isActive, true);
    assert.ok(community.createdAt instanceof Date);

    const reviewed = await MoveRequest.create({ ...requestData, type: MoveRequestType.MOVE_OUT, reviewedBy: admin.id, reviewedAt: new Date() });
    const { document } = await verifyRequestExtensions({ sequelize, community, request: reviewed, admin });
    await verifyAgentTracking({ sequelize, request: reviewed, resident });
    for (const instance of [community, unit, resident, admin, reviewed]) {
      for (const association of Object.values(instance.constructor.associations)) {
        const loaded = await instance.constructor.findByPk(instance.id, { include: [association] });
        assert.ok(loaded.get(association.as), `${instance.constructor.name}.${association.as} must load`);
      }
    }

    const foreignKeyError = (error) => ['23503', '23001'].includes(error.original?.code);
    await assert.rejects(Unit.create({ communityId: randomUUID(), unitNumber: '999', tower: 'A', floor: 1 }), foreignKeyError);
    await assert.rejects(Resident.create({ ...residentData, unitId: foreignUnit.id }), foreignKeyError);
    await assert.rejects(MoveRequest.create({ ...requestData, residentId: randomUUID() }), foreignKeyError);
    await assert.rejects(MoveRequest.create({ ...requestData, unitId: otherUnit.id }), foreignKeyError);
    await assert.rejects(MoveRequest.create({ ...requestData, communityId: otherCommunity.id }), foreignKeyError);
    await assert.rejects(MoveRequest.create({ ...requestData, reviewedBy: foreignAdmin.id }), foreignKeyError);
    await assert.rejects(Community.create({ name: 'Duplicate', code: community.code, address: 'Address' }), { name: 'SequelizeUniqueConstraintError' });
    await assert.rejects(Unit.create({ communityId: community.id, unitNumber: '101', tower: 'A', floor: 1 }), { name: 'SequelizeUniqueConstraintError' });

    // Raw SQL bypasses model validation to prove the database owns these constraints.
    for (const [table, field] of [['residents', 'residentType'], ['admins', 'role'], ['move_requests', 'type'], ['move_requests', 'status']]) {
      await assert.rejects(sequelize.query(`UPDATE "${table}" SET "${field}" = 'INVALID'`), (error) => error.original?.code === '22P02');
    }
    await assert.rejects(sequelize.query('UPDATE "move_requests" SET "residentId" = NULL'), (error) => error.original?.code === '23502');
    for (const status of Object.values(MoveRequestStatus)) await request.update({ status });

    // Database UUID/timestamp defaults must also work outside the ORM.
    const [rows] = await sequelize.query('INSERT INTO communities (name, code, address) VALUES ($1, $2, $3) RETURNING *', { bind: ['Raw', 'RAW', 'Address'] });
    assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
    assert.equal(rows[0].isActive, true);
    assert.ok(rows[0].createdAt instanceof Date);

    await assert.rejects(community.destroy(), foreignKeyError);
    await assert.rejects(unit.destroy(), foreignKeyError);
    await assert.rejects(resident.destroy(), foreignKeyError);
    await admin.destroy();
    await reviewed.reload();
    assert.equal(reviewed.reviewedBy, null);
    assert.equal(reviewed.communityId, community.id);
    await document.reload();
    assert.equal(document.verifiedBy, null, 'Deleting an admin clears document verifier');
    assert.ok(document.verifiedAt instanceof Date, 'Deleting an admin preserves verification timestamp');

    await migrator.down(); // Optional-document policy rollback does not invent prior requirements.
    await migrator.down(); // Data-only retirement does not restore obsolete rules.
    // All fixtures have complete details, so restoring NOT NULL is safe here.
    await migrator.down();
    // Roll back the six tracking tables without touching the earlier schema and data.
    for (let i = 0; i < 6; i++) await migrator.down();
    assert.equal((await migrator.executed()).length, 10);
    assert.equal((await existingWorkflow.reload()).instructions, 'Existing workflow');
    assert.equal((await reviewed.reload()).id, reviewed.id);
    const [functions] = await sequelize.query("SELECT proname FROM pg_proc WHERE proname IN ('reject_audit_logs_mutation', 'reject_status_histories_mutation') AND pronamespace = 'public'::regnamespace");
    assert.equal(functions.length, 0, 'Rollback must remove append-only trigger functions');
    const [priorEnums] = await sequelize.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
    assert.equal(priorEnums.length, 9, 'Rollback must preserve the previous ten tables enum types');

    // Rolling back the five request-extension tables must preserve the core rows.
    for (let i = 0; i < 5; i++) await migrator.down();
    assert.equal((await migrator.executed()).length, 5);
    assert.equal((await reviewed.reload()).id, reviewed.id);
    assert.equal((await existingCommunity.reload()).code, 'EXISTING');
    const [remainingEnums] = await sequelize.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
    assert.equal(remainingEnums.length, 4, 'Rolling back extensions must preserve only the original enum types');

    await migrator.down({ to: 0 });
    assert.deepEqual(await queryInterface.showAllTables(), ['SequelizeMeta']);
    const [enums] = await sequelize.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
    assert.equal(enums.length, 0, 'Rollback must remove enum types');
    await migrator.up();
    assert.equal((await migrator.executed()).length, 19, 'Migrations must reapply after rollback');
    await verifySeeds({ sequelize });
    console.log('PASS: all 16 models; upgrades/down/up, model parity, associations, JSONB, defaults, enums, foreign keys, append-only enforcement and deletion rules');
  } finally {
    try {
      if (ownsSchema) {
        await migrator.down({ to: 0 });
        await queryInterface.dropTable('SequelizeMeta');
      }
    } finally {
      await sequelize.close();
    }
  }
}

module.exports = { verifySchema };
if (require.main === module) {
  verifySchema().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
