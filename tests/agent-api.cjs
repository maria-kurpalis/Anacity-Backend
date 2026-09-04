const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyAgentApi() {
  // Tests intercept the adapter's HTTP call; no credentials or live AI are used.
  process.env.OPENAI_API_KEY = 'test-key-not-a-secret';
  process.env.AI_MODEL = 'test-structured-model';
  process.env.AI_PROVIDER = 'openai';
  await withTestApi(async ({ models, call, fail }) => {
    const { Community, Resident, Admin, MoveRequest, MoveRequestDetails, CommunityWorkflowConfig, AgentConversation, AgentAssessment, Document, AgentToolExecution } = models;
    const green = await Community.findOne({ where: { code: 'GREEN_HEIGHTS' } });
    const marina = await Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
    const [resident, sameCommunityResident] = await Resident.findAll({ where: { communityId: green.id } });
    const outsideResident = await Resident.findOne({ where: { communityId: marina.id } });
    const admin = await Admin.findOne({ where: { communityId: green.id } });
    const outsideAdmin = await Admin.findOne({ where: { communityId: marina.id } });
    const config = await CommunityWorkflowConfig.findOne({ where: { communityId: green.id, requestType: 'MOVE_IN' } });
    const newRequest = (status = 'DRAFT') => MoveRequest.create({
      residentId: resident.id, communityId: green.id, unitId: resident.unitId,
      type: 'MOVE_IN', status, requestedDate: null, requestedTimeSlot: null,
    });
    const request = await newRequest();
    await MoveRequestDetails.create({ moveRequestId: request.id, movingCompany: 'Historical value only' });
    const chatPath = (id = request.id) => `/agent/move-requests/${id}/chat`;
    const assessmentPath = (id = request.id) => `/admin/move-requests/${id}/agent-assessment`;
    const chat = (message = 'We are three occupants.', id = request.id) => call('POST', chatPath(id), { residentId: resident.id, message });
    const generate = (id = request.id) => call('POST', assessmentPath(id), { adminId: admin.id });
    let responseValue = {
      message: 'I found three occupants. Please provide the remaining details.',
      extractedFields: { requestedDate: null, requestedTimeSlot: null, vehicleCount: null, vehicleDetailsJson: null, occupantCount: 3, notes: null },
      missingFields: ['inventedField'], requiresClarification: false,
    };
    let mode = 'success';
    let beforeResponse;
    const sent = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
      const payload = JSON.parse(options.body);
      sent.push(payload);
      assert.equal(payload.store, false);
      assert.equal(payload.model, 'test-structured-model');
      assert.equal(payload.text.format.strict, true);
      assert.ok(payload.instructions.includes('untrusted data'));
      assert.ok(!payload.tools);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      if (beforeResponse) await beforeResponse(payload);
      if (mode === 'network') throw new Error('Private provider failure details');
      if (mode === 'rate-limit') return new Response('Provider details must not leak', { status: 429 });
      if (mode === 'incomplete') return Response.json({ status: 'incomplete', output: [] });
      if (mode === 'refusal') return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] }] });
      return Response.json({ status: 'completed', output: [
        { type: 'reasoning', summary: [{ text: 'PRIVATE_REASONING_MUST_NOT_BE_RETURNED' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: mode === 'bad-json' ? '{' : JSON.stringify(responseValue) }] },
      ] });
    };
    try {
      for (const denied of [sameCommunityResident, outsideResident]) fail(await call('POST', chatPath(), { residentId: denied.id, message: 'Hello' }), 403, 'residentId');
      fail(await call('POST', chatPath(), { residentId: randomUUID(), message: 'Hello' }), 404, 'residentId');
      fail(await call('POST', chatPath(), { residentId: 1, message: 'Hello' }), 400, 'residentId');
      fail(await chat('Hello', randomUUID()), 404, 'id');
      fail(await chat('Hello', '1'), 400, 'id');
      for (const message of ['', ' ', null, {}, 'x'.repeat(8001)]) fail(await chat(message), 400, 'message');
      fail(await chat('\0'), 400, 'body');
      fail(await call('POST', chatPath(), { residentId: resident.id, message: 'Hi', status: 'APPROVED' }), 400, 'status');
      fail(await call('POST', assessmentPath(), { adminId: outsideAdmin.id }), 403, 'adminId');
      fail(await call('POST', assessmentPath(), { adminId: randomUUID() }), 404, 'adminId');
      fail(await call('POST', assessmentPath(), { adminId: 1 }), 400, 'adminId');
      fail(await call('GET', assessmentPath()), 400, 'adminId');
      fail(await call('GET', `${assessmentPath()}?adminId=${outsideAdmin.id}`), 403, 'adminId');
      fail(await call('GET', `${assessmentPath()}?adminId=${admin.id}&status=DRAFT`), 400, 'query');
      fail(await call('GET', `${assessmentPath()}?adminId=${admin.id}`), 404, 'assessment');
      assert.equal(sent.length, 0, 'Never call AI before ownership/membership validation');
      const result = await chat();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body.data.appliedFields, { occupantCount: 3 });
      assert.ok(!result.body.data.missingFields.includes('inventedField'));
      assert.ok(!result.body.data.missingFields.includes('movingCompany'));
      assert.ok(!JSON.stringify(result.body.data).includes('TENANCY_AGREEMENT'));
      assert.equal((await MoveRequestDetails.findOne({ where: { moveRequestId: request.id } })).occupantCount, 3);
      assert.equal((await request.reload()).status, 'DRAFT');
      assert.ok(!JSON.stringify(result.body).includes('PRIVATE_REASONING'));
      let messages = await AgentConversation.findAll({ where: { moveRequestId: request.id }, order: [['createdAt', 'ASC']] });
      assert.deepEqual(messages.map((row) => row.role), ['USER', 'AGENT']);
      assert.equal(messages[0].metadata.interactionId, messages[1].metadata.interactionId);
      assert.equal(messages[1].metadata.appliedFields.occupantCount, 3);
      const input = JSON.parse(sent[0].input[0].content[0].text);
      for (const key of ['moveRequest', 'details', 'documents', 'checklist', 'community', 'latestAssessment', 'workflowConfig', 'deterministicValidation', 'referenceClock']) assert.ok(key in input.context, key);
      assert.equal(input.context.referenceClock.timeZone, 'Asia/Kolkata');
      assert.ok(!('email' in input.context.resident));
      assert.ok(!('movingCompany' in input.context.details));
      assert.ok(!JSON.stringify(sent[0].text.format.schema).includes('movingCompany'));
      assert.deepEqual(input.context.workflowConfig.requiredDocuments, []);
      assert.ok(!result.body.data.missingFields.some((field) => field.startsWith('documents.')));
      await Document.create({ moveRequestId: request.id, documentType: 'IDENTITY_DOCUMENT', fileUrl: 'https://private.test/secret-signed-url' });
      responseValue.extractedFields = { requestedDate: '2026-09-05' };
      responseValue.requiresClarification = true;
      responseValue.message = 'Which approved time slot would you like on Saturday?';
      const ambiguous = await chat('I want to move next Saturday morning.');
      assert.equal(ambiguous.status, 200);
      assert.deepEqual(ambiguous.body.data.appliedFields, {});
      assert.equal((await request.reload()).requestedDate, null);
      assert.ok(!JSON.stringify(sent.at(-1)).includes('secret-signed-url'));
      const sentContext = JSON.parse(sent.at(-1).input[0].content[0].text).context;
      assert.equal(sentContext.recentMessages.length, 2);
      responseValue.requiresClarification = false;
      const vague = await chat('Sometime next weekend.');
      assert.equal(vague.body.data.requiresClarification, true);
      assert.deepEqual(vague.body.data.appliedFields, {});
      responseValue.extractedFields = { requestedDate: '2026-09-06', requestedTimeSlot: '08:00-11:00' };
      const disallowed = await chat('September 6, 2026, from 08:00 to 11:00.');
      assert.equal(disallowed.status, 200);
      assert.deepEqual(disallowed.body.data.appliedFields, {});
      assert.ok(disallowed.body.data.validationErrors.some((error) => error.field === 'requestedDate'));
      responseValue.extractedFields = { requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00', vehicleDetailsJson: '[{"type":"van"}]' };
      const schedule = await chat('September 7, 2026, 09:00 to 12:00, with a van.');
      assert.equal(schedule.status, 200);
      assert.equal(schedule.body.data.appliedFields.requestedDate, '2026-09-07');
      assert.deepEqual(schedule.body.data.appliedFields.vehicleDetails, [{ type: 'van' }]);
      const successfulChat = structuredClone(responseValue);
      for (const fields of [{ movingCompany: 'No longer collected' }, { status: 'APPROVED' }, { residentId: outsideResident.id }, { communityId: marina.id }, { reviewedBy: admin.id }, { requestedDate: '2026-02-30' }, { vehicleCount: -1 }, { vehicleDetailsJson: 'not-json' }]) {
        const count = await AgentConversation.count();
        responseValue.extractedFields = fields;
        fail(await chat('Try a change'), 502, 'ai');
        assert.equal(await AgentConversation.count(), count);
      }
      responseValue = successfulChat;
      for (const failure of ['network', 'rate-limit', 'incomplete', 'refusal', 'bad-json']) {
        const count = await AgentConversation.count();
        mode = failure;
        const failed = await chat();
        fail(failed, ['network', 'rate-limit'].includes(failure) ? 503 : 502, 'ai');
        assert.ok(!JSON.stringify(failed.body).includes('Private provider'));
        assert.equal(await AgentConversation.count(), count);
      }
      mode = 'success';
      const count = await AgentConversation.count();
      const originalCreate = AgentConversation.create;
      responseValue.extractedFields = { occupantCount: 8 };
      AgentConversation.create = async function (values, options) {
        if (values.role === 'AGENT') throw new Error('TEST_AGENT_PERSIST_FAILURE');
        return originalCreate.call(this, values, options);
      };
      try { fail(await chat('Eight occupants'), 500, 'request'); }
      finally { AgentConversation.create = originalCreate; }
      assert.equal(await AgentConversation.count(), count);
      assert.equal((await MoveRequestDetails.findOne({ where: { moveRequestId: request.id } })).occupantCount, 3);
      beforeResponse = async () => {
        const edit = await call('PATCH', `/move-requests/${request.id}`, { occupantCount: 4 });
        assert.equal(edit.status, 200, 'Provider calls must not hold the request lock');
      };
      fail(await chat('Eight occupants'), 409, 'context');
      beforeResponse = undefined;
      assert.equal(await AgentConversation.count(), count);
      assert.equal((await MoveRequestDetails.findOne({ where: { moveRequestId: request.id } })).occupantCount, 4);
      assert.equal((await chat('Eight occupants')).status, 200, 'Retry works with refreshed context');
      await request.update({ status: 'SUBMITTED' });
      const readonly = await chat('Five occupants');
      assert.deepEqual(readonly.body.data.appliedFields, {});
      assert.ok(readonly.body.data.validationErrors.some((error) => error.field === 'status'));
      assert.equal((await request.reload()).status, 'SUBMITTED');

      responseValue = { recommendation: 'APPROVE', confidence: 0.92, reasoning: 'All requirements appear satisfied.', issues: [] };
      const assessment = await generate();
      assert.equal(assessment.status, 201, JSON.stringify(assessment.body));
      const assessmentContext = JSON.parse(sent.at(-1).input[0].content[0].text).context;
      assert.equal(assessmentContext.community.id, green.id);
      assert.ok(assessmentContext.recentMessages.length > 0);
      assert.equal(assessment.body.data.recommendation, 'REQUEST_CHANGES');
      assert.equal(assessment.body.data.confidence, null);
      assert.ok(assessment.body.data.issues.some((issue) => issue.source === 'deterministic'));
      assert.equal((await request.reload()).status, 'SUBMITTED');
      const latest = await call('GET', `${assessmentPath()}?adminId=${admin.id}`);
      assert.equal(latest.body.data.id, assessment.body.data.id);
      const validReview = await newRequest('UNDER_REVIEW');
      await validReview.update({ requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00' });
      await MoveRequestDetails.create({ moveRequestId: validReview.id, vehicleCount: 1, occupantCount: 2 });
      const clean = await generate(validReview.id);
      assert.equal(clean.body.data.recommendation, 'APPROVE');
      assert.deepEqual(clean.body.data.issues, [], 'Zero documents do not create assessment findings when documents are optional');
      assert.equal((await validReview.reload()).status, 'UNDER_REVIEW', 'Recommendations never mutate workflow status');
      responseValue = { recommendation: 'MANUAL_REVIEW', confidence: null, reasoning: 'Please review the supplied records.', issues: [{ field: 'review', message: 'Human review suggested.' }] };
      assert.equal((await generate(validReview.id)).status, 201);
      assert.equal(JSON.parse(sent.at(-1).input[0].content[0].text).context.latestAssessment.id, clean.body.data.id);
      assert.equal(await AgentAssessment.count({ where: { moveRequestId: validReview.id } }), 2);
      assert.equal((await call('GET', `${assessmentPath(validReview.id)}?adminId=${admin.id}`)).body.data.recommendation, 'MANUAL_REVIEW');
      for (const value of [{ ...responseValue, confidence: 2 }, { ...responseValue, status: 'APPROVED' }, { ...responseValue, issues: ['not-a-structured-issue'] }]) {
        const prior = await AgentAssessment.count();
        responseValue = value;
        fail(await generate(validReview.id), 502, 'ai');
        assert.equal(await AgentAssessment.count(), prior);
      }
      responseValue = { recommendation: 'APPROVE', confidence: 0.9, reasoning: 'Summary.', issues: [] };
      const prior = await AgentAssessment.count();
      beforeResponse = async () => { await config.update({ instructions: 'Updated while AI was evaluating.' }); };
      fail(await generate(validReview.id), 409, 'context');
      beforeResponse = undefined;
      assert.equal(await AgentAssessment.count(), prior);
      mode = 'network';
      fail(await generate(validReview.id), 503, 'ai');
      assert.equal(await AgentAssessment.count(), prior);
      mode = 'success';
      const savedKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      try { fail(await chat(), 503, 'ai'); }
      finally { process.env.OPENAI_API_KEY = savedKey; }
      const logs = await AgentToolExecution.findAll();
      assert.ok(logs.some((log) => log.toolName === 'resident_chat_validated_update'));
      assert.ok(logs.some((log) => log.toolName === 'generate_validated_assessment'));
      assert.ok(!JSON.stringify(logs).includes('test-key-not-a-secret'));
      for (const log of logs) {
        assert.equal(log.status, 'SUCCESS');
        assert.ok(!Object.hasOwn(log.input, 'message'));
        assert.ok(!Object.hasOwn(log.output, 'reasoning'));
      }
      console.log('PASS: agent authorization, provider isolation/structured output, conversation persistence, safe updates, ambiguity, rule enforcement, stale-context rejection, advisory assessments and rollback/retry behavior');
    } finally { global.fetch = originalFetch; }
  });
}
module.exports = { verifyAgentApi };
if (require.main === module) verifyAgentApi().catch((error) => { console.error(error); process.exitCode = 1; });
