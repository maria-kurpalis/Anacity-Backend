const assert = require('node:assert/strict');

const ENV_NAMES = ['AI_PROVIDER', 'AI_MODEL', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'AI_TIMEOUT_MS', 'AI_TIME_ZONE'];
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
const originalFetch = global.fetch;

function restoreEnvironment() {
  for (const name of ENV_NAMES) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  global.fetch = originalFetch;
}

function expectApiError(status, field = 'ai') {
  return (error) => error && error.status === status && error.errors?.[0]?.field === field;
}

function geminiResponse(value) {
  return Response.json({
    candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }],
  });
}

async function verifyAIProviders() {
  const { getAIConfig, getAIConfigurationStatus } = require('../dist/config/ai.js');
  const { getAIProvider } = require('../dist/services/ai/provider.js');
  const { createGeminiProvider } = require('../dist/services/ai/gemini.provider.js');
  const { logProviderException } = require('../dist/services/ai/shared.js');
  const { parseAgentAssessmentOutput, parseAgentChatOutput } = require('../dist/validation/agent.js');

  for (const name of ENV_NAMES) delete process.env[name];
  process.env.AI_MODEL = 'test-model';
  process.env.AI_TIME_ZONE = 'Asia/Kolkata';

  process.env.AI_PROVIDER = 'openai';
  process.env.GEMINI_API_KEY = 'gemini-key-must-not-configure-openai';
  await assert.rejects(async () => getAIConfig(), expectApiError(503));
  process.env.OPENAI_API_KEY = 'openai-test-key';
  assert.equal(getAIConfig().provider, 'openai');

  process.env.AI_PROVIDER = 'gemini';
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(async () => getAIConfig(), expectApiError(503));
  process.env.GEMINI_API_KEY = 'gemini-test-key';
  assert.equal(getAIConfig().provider, 'gemini');
  assert.deepEqual(getAIConfigurationStatus(), { agentConfigured: true, provider: 'gemini' });

  process.env.AI_PROVIDER = 'unsupported-provider-secret';
  await assert.rejects(async () => getAIConfig(), expectApiError(503));
  assert.deepEqual(getAIConfigurationStatus(), { agentConfigured: false, provider: null });

  const selectedUrls = [];
  global.fetch = async (url, options) => {
    selectedUrls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) {
      assert.equal(options.headers['x-goog-api-key'], 'gemini-test-key');
      return geminiResponse({
        message: 'Gemini response.',
        extractedFields: { requestedDate: null, requestedTimeSlot: null, vehicleCount: null, vehicleDetailsJson: null, occupantCount: null, notes: null },
        missingFields: [], requiresClarification: false,
      });
    }
    return Response.json({ status: 'completed', output: [{
      type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
        message: 'OpenAI response.',
        extractedFields: { requestedDate: null, requestedTimeSlot: null, vehicleCount: null, vehicleDetailsJson: null, occupantCount: null, notes: null },
        missingFields: [], requiresClarification: false,
      }) }],
    }] });
  };
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  await getAIProvider().chat({ context: {}, message: 'Hello' });
  process.env.AI_PROVIDER = 'gemini';
  await getAIProvider().chat({ context: {}, message: 'Hello' });
  assert.equal(selectedUrls[0], 'https://api.openai.com/v1/responses');
  assert.equal(selectedUrls[1], 'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');

  const requests = [];
  const provider = createGeminiProvider({ apiKey: 'gemini-test-key', model: 'gemini-2.5-flash', timeoutMs: 30000 });
  let responseValue;
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options, body: JSON.parse(options.body) });
    return geminiResponse(responseValue);
  };

  responseValue = {
    message: 'I found the date, time, occupants and vehicle.',
    extractedFields: {
      requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00', vehicleCount: 1,
      vehicleDetailsJson: '[{"registrationNumber":"KA01AB1234"}]', occupantCount: 2, notes: null,
    },
    missingFields: [], requiresClarification: false,
  };
  const chat = await provider.chat({ context: { workflowConfig: { requiredFields: ['requestedDate'] } }, message: 'September 7' });
  assert.deepEqual(chat.extractedFields.vehicleDetails, [{ registrationNumber: 'KA01AB1234' }]);
  assert.ok(!Object.hasOwn(chat.extractedFields, 'vehicleDetailsJson'));
  const chatRequest = requests.at(-1);
  assert.equal(chatRequest.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(chatRequest.body.generationConfig.maxOutputTokens, 4000);
  assert.equal(chatRequest.body.generationConfig.responseJsonSchema.type, 'object');
  assert.ok(chatRequest.body.systemInstruction.parts[0].text.includes('untrusted data'));
  assert.ok(!JSON.stringify(chatRequest.body).includes('movingCompany'));
  assert.ok(!JSON.stringify(chatRequest.body).includes('TENANCY_AGREEMENT'));
  assert.ok(!JSON.stringify(chatRequest.body).includes('gemini-test-key'));
  assert.equal(chatRequest.options.redirect, 'error');
  assert.ok(chatRequest.options.signal);

  responseValue = {
    recommendation: 'MANUAL_REVIEW', confidence: 0.72,
    reasoning: 'A human should resolve the deterministic warning.',
    issues: [{ field: 'documents', message: 'Verification remains pending.' }],
  };
  const assessment = await provider.generateAssessment({ context: { deterministicValidation: { errors: [] } } });
  assert.deepEqual(assessment, responseValue);

  responseValue = {
    message: 'Invalid application structure.', extractedFields: {},
    missingFields: 'not-an-array', requiresClarification: false,
  };
  await assert.rejects(async () => parseAgentChatOutput(await provider.chat({ context: {}, message: 'Hello' })), expectApiError(502));
  responseValue = { recommendation: 'APPROVE', confidence: 2, reasoning: 'Invalid confidence.', issues: [] };
  await assert.rejects(async () => parseAgentAssessmentOutput(await provider.generateAssessment({ context: {} })), expectApiError(502));

  global.fetch = async () => new Response('{', { status: 200 });
  await assert.rejects(provider.chat({ context: {}, message: 'Hello' }), expectApiError(502));
  global.fetch = async () => Response.json({ candidates: [] });
  await assert.rejects(provider.generateAssessment({ context: {} }), expectApiError(502));
  global.fetch = async () => new Response('sensitive upstream detail', { status: 429 });
  await assert.rejects(provider.chat({ context: {}, message: 'Hello' }), (error) => {
    assert.ok(expectApiError(503)(error));
    assert.ok(!JSON.stringify(error).includes('sensitive upstream detail'));
    return true;
  });
  global.fetch = async () => { throw new Error('sensitive network detail'); };
  await assert.rejects(provider.generateAssessment({ context: {} }), (error) => {
    assert.ok(expectApiError(503)(error));
    assert.ok(!JSON.stringify(error).includes('sensitive network detail'));
    return true;
  });

  let called = false;
  global.fetch = async () => { called = true; return geminiResponse({}); };
  await assert.rejects(provider.chat({ context: { oversized: 'x'.repeat(200001) }, message: 'Hello' }), expectApiError(413, 'context'));
  assert.equal(called, false, 'Oversized context must be rejected before contacting Gemini');

  const capturedLogs = [];
  const originalConsoleError = console.error;
  console.error = (...values) => capturedLogs.push(values);
  try {
    logProviderException('gemini', 'redaction_test', new Error('Request failed for gemini-test-key'), 'gemini-test-key');
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(JSON.stringify(capturedLogs).includes('[REDACTED]'));
  assert.ok(!JSON.stringify(capturedLogs).includes('gemini-test-key'));

  console.log('PASS: OpenAI/Gemini selection, provider-specific config, Gemini structured mapping, safe failures and context limits');
}

verifyAIProviders().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(restoreEnvironment);
