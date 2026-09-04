const { spawn } = require('node:child_process');
const path = require('node:path');
const { withTestApi } = require('./api-test-context.cjs');

async function verifyResidentFrontend() {
  // Only the external AI provider is substituted. Every browser request runs
  // through the actual Express services, migrations and a dedicated test DB.
  const providerModule = require('../dist/services/ai/provider');
  const originalProvider = providerModule.getAIProvider;
  const previousEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, AI_MODEL: process.env.AI_MODEL, AI_PROVIDER: process.env.AI_PROVIDER };
  process.env.OPENAI_API_KEY = 'test-only-unused';
  process.env.AI_MODEL = 'test-only';
  process.env.AI_PROVIDER = 'openai';
  providerModule.getAIProvider = () => ({
    chat: async ({ message, context }) => {
      if (message.includes('simulate failure')) throw new Error('Test provider unavailable');
      // Scripted provider boundary only: exercise real clarification persistence,
      // conversation context and deterministic safe-field writes below it.
      if (/next Saturday/i.test(message)) {
        const date = new Date(`${context.referenceClock.date}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7 || 7));
        const requestedDate = date.toISOString().slice(0, 10);
        const slot = context.workflowConfig.allowedTimeSlots[0];
        const requestedTimeSlot = `${slot.start}-${slot.end}`;
        return { message: `Shall I use ${requestedDate} between ${requestedTimeSlot}?`,
          extractedFields: { requestedDate, requestedTimeSlot }, missingFields: [], requiresClarification: true };
      }
      if (/^yes\.?$/i.test(message)) {
        const offer = context.recentMessages.filter((item) => item.role === 'AGENT').at(-1)?.message;
        const match = offer?.match(/(\d{4}-\d{2}-\d{2}) between (\d{2}:\d{2}-\d{2}:\d{2})/);
        if (!match) throw new Error('Confirmation must receive the preceding persisted offer');
        return { message: 'I will use your confirmed date and morning slot. Please complete the remaining requirements.',
          extractedFields: { requestedDate: match[1], requestedTimeSlot: match[2] }, missingFields: [], requiresClarification: false };
      }
      return { message: 'I have recorded your note about the service lift. Choose a date and an approved time slot next.',
        extractedFields: { notes: 'Use the service lift.' }, missingFields: [], requiresClarification: false };
    },
    generateAssessment: async () => { throw new Error('Not used in resident tests'); },
  });
  try {
    await withTestApi(async ({ models, base }) => {
      const resident = await models.Resident.findOne({ where: { email: 'ananya.rao@green-heights.example.test' } });
      const admin = await models.Admin.findOne({ where: { communityId: resident.communityId } });
      const marina = await models.Community.findOne({ where: { code: 'MARINA_RESIDENCE' } });
      const marinaResident = await models.Resident.findOne({ where: { communityId: marina.id }, order: [['name', 'ASC']] });
      const emptyResident = await models.Resident.create({ communityId: resident.communityId, unitId: resident.unitId,
        name: 'New Resident', email: 'new-resident@example.test', phone: '9000000000', residentType: 'TENANT' });
      const frontendPath = path.resolve(__dirname, '../../frontend');
      const child = spawn(process.execPath, [path.join(frontendPath, 'node_modules/@playwright/test/cli.js'), 'test', 'resident.spec.ts', 'login.spec.ts'], {
        cwd: frontendPath, stdio: 'inherit', windowsHide: true,
        env: { ...process.env, E2E_API_BASE: base, E2E_RESIDENT_ID: resident.id, E2E_ADMIN_ID: admin.id,
          E2E_MARINA_RESIDENT_ID: marinaResident.id, E2E_EMPTY_RESIDENT_ID: emptyResident.id },
      });
      const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
      if (code !== 0) throw new Error(`Resident frontend tests exited with ${code}`);
      console.log('PASS: resident frontend against the real API and isolated database');
    });
  } finally {
    providerModule.getAIProvider = originalProvider;
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
module.exports = { verifyResidentFrontend };
if (require.main === module) verifyResidentFrontend().catch((error) => { console.error(error); process.exitCode = 1; });
