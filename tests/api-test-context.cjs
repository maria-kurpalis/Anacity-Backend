const assert = require('node:assert/strict');
const { fixtureIdentity } = require('./fixture-identity.cjs');

async function withTestApi(work) {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a dedicated empty test database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { sequelize } = require('../dist/config/database');
  const { migrator } = require('../dist/migrations/runner');
  const { seeder } = require('../dist/seeders/runner');
  const { app } = require('../dist/app');
  const models = require('../dist/models');
  const qi = sequelize.getQueryInterface();
  let ownsDatabase = false;
  let server;
  try {
    assert.equal((await qi.showAllTables()).length, 0, 'API tests refuse an existing database');
    ownsDatabase = true;
    await migrator.up();
    await seeder.up();
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
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
    await work({ sequelize, models, call, fail, base });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      if (ownsDatabase) {
        const tables = await qi.showAllTables();
        if (tables.length) await sequelize.query(`DROP TABLE ${tables.map((table) => qi.quoteIdentifier(table)).join(', ')} CASCADE`);
        const [enums] = await sequelize.query("SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace");
        for (const { typname } of enums) await sequelize.query(`DROP TYPE ${qi.quoteIdentifier(typname)}`);
        await sequelize.query('DROP FUNCTION IF EXISTS reject_audit_logs_mutation()');
        await sequelize.query('DROP FUNCTION IF EXISTS reject_status_histories_mutation()');
      }
    } finally { await sequelize.close(); }
  }
}
module.exports = { withTestApi };
