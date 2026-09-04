const assert = require('node:assert/strict');
const { Client } = require('pg');

async function verifyResetDatabase() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty PostgreSQL test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { resetDatabase } = require('../dist/scripts/resetDatabase');
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  await assert.rejects(resetDatabase(), /disabled when NODE_ENV is production/);
  process.env.NODE_ENV = 'test';
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false });
  await client.connect();
  let ownsDatabase = false;
  try {
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(tables.rowCount, 0, 'Reset test requires an empty database');
    ownsDatabase = true;
    const { sequelize } = require('../dist/config/database');
    const { migrator } = require('../dist/migrations/runner');
    const { seeder } = require('../dist/seeders/runner');
    const { Community, AuditLog, StatusHistory, MoveRequest } = require('../dist/models');
    await migrator.up();
    await seeder.up();
    await Community.create({ name: 'Reset must remove me', code: 'RESET_REMOVE_ME', address: 'Temporary' });
    const request = await MoveRequest.findOne();
    await AuditLog.create({ moveRequestId: request.id, actorType: 'SYSTEM', action: 'RESET_TEST' });
    await StatusHistory.create({ moveRequestId: request.id, toStatus: 'DRAFT', changedByType: 'SYSTEM' });
    await resetDatabase();
    await assert.rejects(sequelize.authenticate(), /closed/);

    for (const [table, count] of [['communities', 2], ['units', 6], ['residents', 4], ['admins', 2], ['community_workflow_configs', 4], ['move_requests', 3], ['move_request_details', 3], ['request_checklists', 6], ['audit_logs', 0], ['status_histories', 0]]) {
      assert.equal(Number((await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count), count, table);
    }
    assert.equal((await client.query("SELECT id FROM communities WHERE code = 'RESET_REMOVE_ME'")).rowCount, 0);
    assert.equal((await client.query('SELECT name FROM "SequelizeSeedMeta"')).rowCount, 1);
    // A reset does not pretend historical migration files were executed.
    const meta = await client.query("SELECT to_regclass('public.\"SequelizeMeta\"') AS name");
    if (meta.rows[0].name) assert.equal((await client.query('SELECT name FROM "SequelizeMeta"')).rowCount, 0);
    const counts = await client.query("SELECT conname FROM pg_constraint WHERE conname IN ('residents_unit_community_fk', 'move_requests_unit_community_fk', 'move_requests_resident_community_unit_fk', 'move_requests_reviewer_community_fk', 'move_request_details_vehicle_count_nonnegative', 'move_request_details_occupant_count_nonnegative')");
    assert.equal(counts.rowCount, 6);
    await assert.rejects(client.query('UPDATE move_request_details SET "vehicleCount" = -1'), (error) => error.code === '23514');
    const audit = await client.query("INSERT INTO audit_logs (\"actorType\", action) VALUES ('SYSTEM', 'RESET_CHECK') RETURNING id");
    assert.match(audit.rows[0].id, /^[0-9a-f-]{36}$/);
    for (const table of ['audit_logs', 'status_histories']) {
      await assert.rejects(client.query(`DELETE FROM "${table}"`), (error) => error.code === '55000');
      await assert.rejects(client.query(`TRUNCATE "${table}"`), (error) => error.code === '55000');
    }
    const defaults = await client.query("SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('id', 'createdAt', 'updatedAt')");
    assert.ok(defaults.rows.every((row) => row.column_default !== null));

    // Verify finally closes the shared connection even when authentication fails.
    const authenticate = sequelize.authenticate;
    const close = sequelize.close;
    let closeCalls = 0;
    sequelize.authenticate = async () => { throw new Error('SIMULATED_CONNECTION_FAILURE'); };
    sequelize.close = async () => { closeCalls++; };
    try {
      await assert.rejects(resetDatabase(), /SIMULATED_CONNECTION_FAILURE/);
      assert.equal(closeCalls, 1);
    } finally {
      sequelize.authenticate = authenticate;
      sequelize.close = close;
    }
    console.log('PASS: production guard, populated database reset, reusable seeds, preserved SQL constraints/defaults and connection cleanup');
  } finally {
    if (ownsDatabase) {
      const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      const names = tables.rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ');
      if (names) await client.query(`DROP TABLE ${names} CASCADE`);
      const enums = await client.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
      for (const { typname } of enums.rows) await client.query(`DROP TYPE "${typname.replaceAll('"', '""')}"`);
      await client.query('DROP FUNCTION IF EXISTS reject_audit_logs_mutation()');
      await client.query('DROP FUNCTION IF EXISTS reject_status_histories_mutation()');
    }
    await client.end();
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  }
}

module.exports = { verifyResetDatabase };
if (require.main === module) {
  verifyResetDatabase().catch((error) => { console.error(error); process.exitCode = 1; });
}
