const assert = require('node:assert/strict');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyDemoLoginApi() {
  await withTestApi(async ({ call, models, base }) => {
    const resident = await models.Resident.findOne({ where: { email: 'ananya.rao@green-heights.example.test' } });
    const admin = await models.Admin.findOne({ where: { email: 'meera.desai@green-heights.example.test' } });
    for (const [account, userType] of [[resident, 'RESIDENT'], [admin, 'ADMIN']]) {
      const result = await call('POST', '/demo/login', { email: `  ${account.email.toUpperCase()}  ` });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { id: account.id, name: account.name, email: account.email,
        userType, communityId: account.communityId, ...(userType === 'RESIDENT' ? { unitId: account.unitId } : {}) });
    }
    const missing = await call('POST', '/demo/login', { email: 'unknown@example.test' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, 'No account found for this email.');
    for (const body of [{}, { email: '' }, { email: '  ' }, { email: 5 }, { email: 'bad' }, { email: 'x@y' }, { email: ['x@y.test'] }, { email: 'x@y.test', userType: 'ADMIN' }]) {
      assert.equal((await call('POST', '/demo/login', body)).status, 400);
    }
    // Case-folded ambiguity both across tables and within one table is rejected.
    const duplicate = await models.Admin.create({ communityId: resident.communityId, name: 'Ambiguous Demo',
      email: resident.email.toUpperCase(), phone: '9000000000', role: 'STAFF' });
    assert.equal((await call('POST', '/demo/login', { email: resident.email })).status, 409);
    await duplicate.destroy();
    const second = await models.Resident.create({ communityId: resident.communityId, unitId: resident.unitId,
      name: 'Case Variant', email: resident.email.toUpperCase(), phone: '9000000001', residentType: 'TENANT' });
    assert.equal((await call('POST', '/demo/login', { email: resident.email })).status, 409);
    await second.destroy();
    const originalEmail = admin.email;
    await admin.update({ email: originalEmail.toUpperCase() });
    assert.equal((await call('POST', '/demo/login', { email: originalEmail })).body.id, admin.id);
    await admin.update({ email: originalEmail });
    const originalFind = models.Resident.findAll;
    models.Resident.findAll = async () => { throw new Error('SENSITIVE_SQL_DETAILS'); };
    try {
      const failed = await call('POST', '/demo/login', { email: resident.email });
      assert.equal(failed.status, 500);
      assert.ok(!JSON.stringify(failed.body).includes('SENSITIVE_SQL_DETAILS'));
    } finally { models.Resident.findAll = originalFind; }
    // Login does not grant backend access to another identity's records.
    const move = await models.MoveRequest.findOne({ where: { residentId: resident.id } });
    const response = await fetch(`${base}/move-requests/${move.id}`);
    assert.equal(response.status, 400);
    console.log('PASS: seeded resident/admin login, case-insensitive lookup, exact safe responses, validation, missing/ambiguous identities and sanitized errors');
  });
}
module.exports = { verifyDemoLoginApi };
if (require.main === module) verifyDemoLoginApi().catch((error) => { console.error(error); process.exitCode = 1; });
