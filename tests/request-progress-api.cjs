const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyRequestProgressApi() {
  await withTestApi(async ({ models, call, fail }) => {
    const { Resident, CommunityWorkflowConfig, RequestChecklist } = models;
    const resident = await Resident.findOne({ where: { email: 'ananya.rao@green-heights.example.test' } });
    const created = await call('POST', '/move-requests', { residentId: resident.id, type: 'MOVE_IN' });
    const id = created.body.data.id;
    const progress = async () => {
      const result = await call('GET', `/move-requests/${id}/progress`);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.data;
    };
    let data = await progress();
    assert.equal(data.readyToSubmit, false);
    assert.ok(data.missingFields.includes('requestedDate'));
    assert.deepEqual(data.missingDocuments, []);
    assert.deepEqual(data.sections.moveDetails.items.map(item => item.key), ['requestedDate', 'requestedTimeSlot', 'vehicleCount', 'occupantCount']);
    assert.equal(data.sections.documents.items.length, 0);
    assert.ok(!data.missingFields.includes('movingCompany'));
    let submission = await call('POST', `/move-requests/${id}/submit`);
    assert.deepEqual(data.errors, submission.body.errors, 'Progress and submission expose the same validation errors');
    await call('PATCH', `/move-requests/${id}`, {
      requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00', vehicleCount: 0, occupantCount: 2,
    });
    await RequestChecklist.create({ moveRequestId: id, key: 'admin-review', label: 'Community review', status: 'PENDING' });
    data = await progress();
    assert.equal(data.readyToSubmit, true, 'Required fields alone can reach full submission readiness without documents');
    assert.equal(data.sections.moveDetails.completed, true);
    assert.equal(data.sections.documents.completed, true);
    assert.deepEqual(data.errors, []);
    assert.equal(data.sections.checklist.completed, false, 'Checklist is informative, not a submission blocker');
    await call('PATCH', `/move-requests/${id}`, { requestedDate: '2026-09-06' });
    data = await progress();
    submission = await call('POST', `/move-requests/${id}/submit`);
    assert.deepEqual(data.errors, submission.body.errors, 'An invalid community day is shown before submit');
    await call('PATCH', `/move-requests/${id}`, { requestedDate: '2026-09-07' });
    submission = await call('POST', `/move-requests/${id}/submit`);
    assert.equal(submission.status, 200);
    data = await progress();
    assert.equal(data.status, 'SUBMITTED');
    assert.equal(data.readyToSubmit, false, 'Already submitted requests cannot submit again');
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: resident.communityId, requestType: 'MOVE_IN' } });
    await config.update({ allowedTimeSlots: [{ start: 'invalid', end: '12:00' }] });
    data = await progress();
    assert.equal(data.workflowConfig, null, 'Malformed stored configuration must not crash the resident page');
    assert.equal(data.readyToSubmit, false);
    assert.equal(data.sections.documents.completed, false);
    assert.equal(data.errors[0].field, 'workflowConfig');
    await config.destroy();
    data = await progress();
    assert.equal(data.workflowConfig, null);
    assert.equal(data.errors[0].field, 'workflowConfig');
    assert.equal(data.sections.moveDetails.completed, false);
    fail(await call('GET', '/move-requests/1/progress'), 400, 'id');
    fail(await call('GET', `/move-requests/${randomUUID()}/progress`), 404, 'id');
    console.log('PASS: request progress, submission parity, configurable rules, checklist semantics and missing configuration');
  });
}
module.exports = { verifyRequestProgressApi };
if (require.main === module) verifyRequestProgressApi().catch((error) => { console.error(error); process.exitCode = 1; });
