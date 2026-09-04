const { spawn } = require('node:child_process');
const path = require('node:path');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyAdminFrontend() {
  const providerModule = require('../dist/services/ai/provider');
  const originalProvider = providerModule.getAIProvider;
  const previousEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, AI_MODEL: process.env.AI_MODEL, AI_PROVIDER: process.env.AI_PROVIDER };
  process.env.OPENAI_API_KEY = 'test-only-unused'; process.env.AI_MODEL = 'test-only'; process.env.AI_PROVIDER = 'openai';
  providerModule.getAIProvider = () => ({
    chat: async () => { throw new Error('Not used in admin tests'); },
    generateAssessment: async ({ context }) => {
      if (context.details?.notes === 'Simulate provider failure') throw new Error('Test provider unavailable');
      return { recommendation: 'APPROVE', confidence: 0.88, reasoning: 'Required information is available for the administrator to review.', issues: [] };
    },
  });
  try {
    await withTestApi(async ({ models, base, call }) => {
      const resident = await models.Resident.findOne({ where: { email: 'ananya.rao@green-heights.example.test' } });
      const admin = await models.Admin.findOne({ where: { communityId: resident.communityId } });
      const outsideAdmin = await models.Admin.findOne({ where: { email: 'vikram.shah@marina-residence.example.test' } });
      const ids = [];
      for (const [index, type] of ['MOVE_IN', 'MOVE_OUT', 'MOVE_IN'].entries()) {
        const move = (await call('POST', '/move-requests', { residentId: resident.id, type })).body.data;
        await call('PATCH', `/move-requests/${move.id}`, { requestedDate: '2026-09-07', requestedTimeSlot: '09:00-12:00', vehicleCount: 1, occupantCount: 2,
          notes: index === 2 ? 'Simulate provider failure' : 'Moving in the morning.' });
        if (index < 2) {
          await call('POST', `/move-requests/${move.id}/documents`, { documentType: 'IDENTITY_DOCUMENT', fileUrl: 'https://example.test/move.pdf' });
        }
        await models.RequestChecklist.create({ moveRequestId: move.id, key: 'review-documents', label: 'Review documents', status: 'PENDING' });
        const submitted = await call('POST', `/move-requests/${move.id}/submit`);
        if (submitted.status !== 200) throw new Error(JSON.stringify(submitted.body));
        ids.push(move.id);
      }
      const frontendPath = path.resolve(__dirname, '../../frontend');
      const child = spawn(process.execPath, [path.join(frontendPath, 'node_modules/@playwright/test/cli.js'), 'test', 'admin.spec.ts'], {
        cwd: frontendPath, stdio: 'inherit', windowsHide: true,
        env: { ...process.env, E2E_API_BASE: base, E2E_RESIDENT_ID: resident.id, E2E_ADMIN_ID: admin.id, E2E_COMMUNITY_ID: resident.communityId,
          E2E_OUTSIDE_ADMIN_ID: outsideAdmin.id, E2E_OUTSIDE_COMMUNITY_ID: outsideAdmin.communityId, E2E_ADMIN_REQUEST_IDS: ids.join(',') },
      });
      const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
      if (code !== 0) throw new Error(`Admin frontend tests exited with ${code}`);
      console.log('PASS: admin browser workflows against actual API and isolated database');
    });
  } finally {
    providerModule.getAIProvider = originalProvider;
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
module.exports = { verifyAdminFrontend };
if (require.main === module) verifyAdminFrontend().catch((error) => { console.error(error); process.exitCode = 1; });
