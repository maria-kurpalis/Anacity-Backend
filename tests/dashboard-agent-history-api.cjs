const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyDashboardAgentHistoryApi() {
  await withTestApi(async ({ sequelize, models, call, fail }) => {
    const { Community, Unit, Resident, Admin, MoveRequest, AgentConversation, AgentAssessment, CommunityWorkflowConfig } = models;
    const { buildMoveRequestAgentContext } = require('../dist/services/agent-context.service');
    const { buildMoveRequestAgentSummary } = require('../dist/services/agent-summary.service');
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const unit = await Unit.findOne({ where: { communityId: green.id } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const otherResident = await Resident.findOne({ where: { communityId: green.id } });
    const residentValues = { communityId: green.id, unitId: unit.id, name: 'Dashboard Resident', phone: '9000000000', residentType: 'TENANT' };
    const resident = await Resident.create({ ...residentValues, email: 'dashboard@example.test' });
    const emptyResident = await Resident.create({ ...residentValues, email: 'empty-dashboard@example.test' });
    const emptyCommunity = await Community.create({ code: 'DASHBOARD_EMPTY', name: 'Empty Community', address: 'Bangalore' });
    await Admin.create({ communityId: emptyCommunity.id, name: 'Empty Admin', email: 'empty-admin@example.test', phone: '9000000099', role: 'ADMIN' });
    const fixtures = [
      ['DRAFT', 'MOVE_IN'], ['SUBMITTED', 'MOVE_IN'], ['SUBMITTED', 'MOVE_OUT'], ['UNDER_REVIEW', 'MOVE_IN'],
      ['NEEDS_CHANGES', 'MOVE_OUT'], ['APPROVED', 'MOVE_IN'], ['REJECTED', 'MOVE_OUT'], ['CANCELLED', 'MOVE_OUT'],
      ['COMPLETED', 'MOVE_IN'], ['COMPLETED', 'MOVE_OUT'],
    ];
    const records = [];
    const start = Date.now() + 60000;
    for (let i = 0; i < fixtures.length; i++) {
      const [status, type] = fixtures[i];
      records.push(await MoveRequest.create({
        residentId: resident.id, communityId: green.id, unitId: unit.id, status, type,
        requestedDate: null, requestedTimeSlot: null, createdAt: new Date(start + i * 1000),
      }));
    }
    const sql = [];
    const originalLogging = sequelize.options.logging;
    sequelize.options.logging = (statement) => sql.push(statement);
    let residentDashboard;
    try { residentDashboard = await call('GET', `/residents/${resident.id}/dashboard`); }
    finally { sequelize.options.logging = originalLogging; }
    assert.equal(residentDashboard.status, 200, JSON.stringify(residentDashboard.body));
    assert.deepEqual(Object.fromEntries(Object.entries(residentDashboard.body.data).filter(([key]) => key.endsWith('Requests') && key !== 'recentRequests')), {
      totalRequests: 10, draftRequests: 1, submittedRequests: 2, needsChangesRequests: 1,
      approvedRequests: 1, rejectedRequests: 1, completedRequests: 2,
    });
    assert.deepEqual(residentDashboard.body.data.recentRequests.map((row) => row.id), records.slice(-5).reverse().map((row) => row.id));
    assert.ok(residentDashboard.body.data.recentRequests.every((row) => row.residentId === resident.id && row.community.id === green.id && row.unit.unitNumber));
    assert.equal(sql.filter((statement) => /count\(/i.test(statement) && /GROUP BY/i.test(statement)).length, 1, 'Counts use a single grouped aggregate');
    assert.equal(sql.filter((statement) => /FROM "move_requests"/i.test(statement) && !/GROUP BY/i.test(statement)).length, 1);
    assert.ok(sql.some((statement) => /LIMIT 5/i.test(statement)), 'Only five requests are loaded for the cards');
    const adminDashboard = await call('GET', `/admin/communities/${green.id}/dashboard`);
    assert.equal(adminDashboard.status, 200);
    // Green Heights seeds one DRAFT move-in and one SUBMITTED move-out, in addition to the fixtures above.
    assert.equal(adminDashboard.body.data.community.name, green.name);
    assert.deepEqual(Object.fromEntries(Object.entries(adminDashboard.body.data).filter(([key]) => key.endsWith('Requests') && key !== 'recentRequests')), {
      totalRequests: 12, submittedRequests: 3, underReviewRequests: 1, needsChangesRequests: 1,
      approvedRequests: 1, rejectedRequests: 1, completedRequests: 2, moveInRequests: 6, moveOutRequests: 6,
    });
    assert.deepEqual(adminDashboard.body.data.recentRequests.map((row) => row.id), records.slice(-5).reverse().map((row) => row.id));
    const marinaDashboard = (await call('GET', `/admin/communities/${marina.id}/dashboard`)).body.data;
    assert.equal(marinaDashboard.totalRequests, 1);
    assert.equal(marinaDashboard.approvedRequests, 1);
    assert.ok(marinaDashboard.recentRequests.every((row) => row.communityId === marina.id));
    for (const path of [`/residents/${emptyResident.id}/dashboard`, `/admin/communities/${emptyCommunity.id}/dashboard`]) {
      const empty = (await call('GET', path)).body.data;
      assert.deepEqual(empty.recentRequests, []);
      for (const [key, value] of Object.entries(empty)) if (key.endsWith('Requests') && key !== 'recentRequests') assert.equal(value, 0);
      if (path.includes('/residents/')) {
        assert.deepEqual(empty.resident, { id: emptyResident.id, name: emptyResident.name });
        assert.equal(empty.community.code, green.code);
        assert.equal(empty.unit.unitNumber, unit.unitNumber);
      }
    }
    fail(await call('GET', '/residents/1/dashboard'), 400, 'residentId');
    fail(await call('GET', `/residents/${randomUUID()}/dashboard`), 404, 'residentId');
    fail(await call('GET', '/admin/communities/1/dashboard'), 400, 'communityId');
    fail(await call('GET', `/admin/communities/${randomUUID()}/dashboard`), 404, 'communityId');

    const request = records[0];
    const path = `/move-requests/${request.id}/agent-conversations`;
    const empty = await call('GET', `${path}?residentId=${resident.id}`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    fail(await call('GET', path), 400, 'identity');
    fail(await call('GET', `${path}?residentId=${resident.id}&adminId=${admin.id}`), 400, 'identity');
    fail(await call('GET', `${path}?residentId=${otherResident.id}`), 403, 'residentId');
    fail(await call('GET', `${path}?adminId=${outsideAdmin.id}`), 403, 'adminId');
    fail(await call('GET', `${path}?residentId=${randomUUID()}`), 404, 'residentId');
    fail(await call('GET', `${path}?adminId=${randomUUID()}`), 404, 'adminId');
    fail(await call('GET', `/move-requests/${randomUUID()}/agent-conversations?adminId=${admin.id}`), 404, 'id');
    fail(await call('GET', `${path}?residentId=1`), 400, 'residentId');
    fail(await call('GET', `/move-requests/1/agent-conversations?residentId=${resident.id}`), 400, 'id');
    for (const [query, field] of [
      ['page=0', 'page'], ['page=-1', 'page'], ['page=1.5', 'page'], ['page=1e2', 'page'], ['page=', 'page'],
      ['page=1&page=2', 'page'], ['page=999999999999999999999', 'page'], ['page=2147483647&limit=100', 'page'],
      ['limit=0', 'limit'], ['limit=101', 'limit'], ['limit=2.5', 'limit'], ['limit=1&limit=2', 'limit'], ['debug=true', 'query'],
    ]) fail(await call('GET', `${path}?residentId=${resident.id}&${query}`), 400, field);
    const conversations = [];
    for (let i = 0; i < 25; i++) conversations.push(await AgentConversation.create({
      moveRequestId: request.id, role: ['USER', 'AGENT', 'ADMIN'][i % 3], message: `Public message ${i}`,
      metadata: { providerDebug: 'INTERNAL_PROVIDER_DATA', reasoningTrace: 'PRIVATE_REASONING_DATA' }, createdAt: new Date(start + i * 1000),
    }));
    await AgentConversation.create({ moveRequestId: request.id, role: 'SYSTEM', message: 'SYSTEM_INTERNAL_ONLY', metadata: { key: 'internal-value' } });
    await AgentConversation.create({ moveRequestId: records[1].id, role: 'USER', message: 'DIFFERENT_REQUEST_MESSAGE' });
    const firstPage = await call('GET', `${path}?residentId=${resident.id}`);
    assert.deepEqual(firstPage.body.data.map((row) => row.id), conversations.slice(0, 20).map((row) => row.id));
    assert.deepEqual(firstPage.body.pagination, { page: 1, limit: 20, total: 25, totalPages: 2 });
    for (const row of firstPage.body.data) assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'message', 'role']);
    for (const secret of ['INTERNAL_PROVIDER_DATA', 'PRIVATE_REASONING_DATA', 'SYSTEM_INTERNAL_ONLY', 'DIFFERENT_REQUEST_MESSAGE']) assert.ok(!JSON.stringify(firstPage.body).includes(secret));
    const secondPage = await call('GET', `${path}?adminId=${admin.id}&page=2&limit=20`);
    assert.deepEqual(secondPage.body.data.map((row) => row.id), conversations.slice(20).map((row) => row.id));
    assert.equal(secondPage.body.pagination.total, 25);
    const beyond = await call('GET', `${path}?adminId=${admin.id}&page=3`);
    assert.deepEqual(beyond.body.data, []);
    assert.equal(beyond.body.pagination.total, 25);
    assert.equal((await call('GET', `${path}?adminId=${admin.id}&limit=100`)).body.data.length, 25);

    const oldAssessment = await AgentAssessment.create({ moveRequestId: request.id, recommendation: 'MANUAL_REVIEW', confidence: null, reasoning: 'Older public conclusion.', issues: [], createdAt: new Date(start) });
    const latestAssessment = await AgentAssessment.create({ moveRequestId: request.id, recommendation: 'REQUEST_CHANGES', confidence: 0.8, reasoning: 'Missing required fields.', issues: [{ field: 'requestedDate', message: 'A date is required.', source: 'deterministic' }], createdAt: new Date(start + 1000) });
    const snapshot = await buildMoveRequestAgentContext(request.id);
    for (const key of ['moveRequest', 'details', 'resident', 'unit', 'community', 'workflowConfig', 'documents', 'checklist', 'recentMessages', 'latestAssessment', 'deterministicValidation']) assert.ok(key in snapshot.context, key);
    assert.equal(snapshot.context.community.id, green.id);
    assert.equal(snapshot.context.workflowConfig.requestType, request.type);
    assert.equal(snapshot.latestAssessment.id, latestAssessment.id);
    assert.notEqual(snapshot.latestAssessment.id, oldAssessment.id);
    assert.equal(snapshot.context.recentMessages.length, 20);
    assert.equal(snapshot.context.recentMessages[0].message, 'Public message 5');
    assert.equal(snapshot.context.recentMessages.at(-1).message, 'Public message 24');
    assert.ok(snapshot.errors.some((error) => error.field === 'requestedDate'));
    for (const secret of ['INTERNAL_PROVIDER_DATA', 'PRIVATE_REASONING_DATA', 'SYSTEM_INTERNAL_ONLY']) assert.ok(!JSON.stringify(snapshot.context).includes(secret));
    const adminSnapshot = await buildMoveRequestAgentContext(request.id, { identity: { adminId: admin.id } });
    assert.deepEqual(adminSnapshot.context, snapshot.context, 'Chat and assessment consumers receive the same centralized context');
    assert.equal(adminSnapshot.fingerprint, snapshot.fingerprint);
    const summary = await buildMoveRequestAgentSummary(request.id, { identity: { residentId: resident.id } });
    assert.equal(summary.moveRequestId, request.id);
    assert.equal(summary.latestAssessment.id, latestAssessment.id);
    assert.deepEqual(summary.validation, snapshot.context.deterministicValidation);
    await assert.rejects(buildMoveRequestAgentContext(request.id, { identity: { residentId: otherResident.id } }), (error) => error.status === 403);
    await assert.rejects(buildMoveRequestAgentSummary(request.id, { identity: { adminId: outsideAdmin.id } }), (error) => error.status === 403);
    await green.update({ name: 'Updated Community Name' });
    assert.notEqual((await buildMoveRequestAgentContext(request.id)).fingerprint, snapshot.fingerprint);
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: request.type } });
    await config.destroy();
    const missingConfig = await buildMoveRequestAgentContext(request.id);
    assert.equal(missingConfig.context.workflowConfig, null);
    assert.equal(missingConfig.errors[0].field, 'workflowConfig');

    const variables = ['AI_PROVIDER', 'OPENAI_API_KEY', 'AI_MODEL', 'AI_TIMEOUT_MS', 'AI_TIME_ZONE'];
    const originalEnv = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
    const originalFetch = global.fetch;
    let providerCalls = 0;
    global.fetch = (url, options) => {
      if (String(url).startsWith('https://api.openai.com')) { providerCalls++; throw new Error('Health must never call a provider'); }
      return originalFetch(url, options);
    };
    try {
      for (const name of variables) delete process.env[name];
      let health = await call('GET', '/agent/health');
      assert.equal(health.status, 200);
      assert.deepEqual(health.body, { agentConfigured: false, provider: 'openai' });
      process.env.OPENAI_API_KEY = 'health-test-secret-never-return';
      process.env.AI_MODEL = 'health-test-model';
      health = await call('GET', '/agent/health');
      assert.deepEqual(health.body, { agentConfigured: true, provider: 'openai' });
      assert.ok(!JSON.stringify(health.body).includes('health-test-secret'));
      assert.ok(!JSON.stringify(health.body).includes('health-test-model'));
      for (const [name, value] of [['AI_PROVIDER', 'unrecognized-secret-value'], ['AI_TIMEOUT_MS', '0'], ['AI_TIME_ZONE', 'invalid/time-zone']]) {
        process.env[name] = value;
        health = await call('GET', '/agent/health');
        assert.equal(health.status, 200);
        assert.equal(health.body.agentConfigured, false);
        assert.ok(!JSON.stringify(health.body).includes(value));
        delete process.env[name];
      }
      assert.equal(providerCalls, 0);
    } finally {
      global.fetch = originalFetch;
      for (const name of variables) {
        if (originalEnv[name] === undefined) delete process.env[name];
        else process.env[name] = originalEnv[name];
      }
    }
    console.log('PASS: dashboard aggregates, all-status counts and scope, latest-five queries, authorized conversation pagination/redaction, centralized context/summary and secret-free configuration health');
  });
}
module.exports = { verifyDashboardAgentHistoryApi };
if (require.main === module) verifyDashboardAgentHistoryApi().catch((error) => { console.error(error); process.exitCode = 1; });
