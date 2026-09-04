const assert = require('node:assert/strict');

async function verifySeeds({ sequelize }) {
  const { seeder } = require('../dist/seeders/runner');
  const { Community, Unit, Resident, Admin, CommunityWorkflowConfig, MoveRequest, MoveRequestDetails, RequestChecklist, RequestComment } = require('../dist/models');
  const fixtures = require('../dist/seeders/fixtures/local-workflow');
  const expected = [[Community, 2], [Unit, 6], [Resident, 4], [Admin, 2], [CommunityWorkflowConfig, 4], [MoveRequest, 3], [MoveRequestDetails, 3], [RequestChecklist, 6]];
  const outsider = await Community.create({ name: 'Unrelated community', code: 'SEED_TEST_KEEP', address: 'Bangalore' });
  const before = await Promise.all(expected.map(([model]) => model.count()));
  try {
    assert.equal((await seeder.up()).length, 1);
    assert.equal((await seeder.up()).length, 0, 'Running tracked seeds again must not duplicate rows');
    for (let i = 0; i < expected.length; i++) assert.equal(await expected[i][0].count(), before[i] + expected[i][1]);
    for (const fixture of fixtures.communities) {
      const community = await Community.findOne({ where: { code: fixture.code } });
      for (const key of ['name', 'code', 'address', 'isActive']) assert.equal(community[key], fixture[key]);
      const residents = await Resident.findAll({ where: { communityId: community.id }, include: ['unit'] });
      assert.equal(residents.length, 2);
      assert.deepEqual(residents.map((row) => row.residentType).sort(), ['OWNER', 'TENANT']);
      for (const row of residents) assert.equal(row.unit.communityId, community.id);
      const units = await Unit.findAll({ where: { communityId: community.id } });
      assert.deepEqual(units.map((row) => row.unitNumber).sort(), fixtures.units.filter((row) => row.communityCode === fixture.code).map((row) => row.unitNumber).sort());
      assert.equal(await Admin.count({ where: { communityId: community.id } }), 1);
      for (const config of fixtures.workflowConfigs.filter((row) => row.communityCode === fixture.code)) {
        const saved = await CommunityWorkflowConfig.findOne({ where: { communityId: community.id, requestType: config.requestType } });
        for (const field of ['requiredFields', 'requiredDocuments', 'allowedDays', 'allowedTimeSlots', 'instructions']) assert.deepEqual(saved[field], config[field]);
      }
    }
    for (const fixture of fixtures.requestFixtures) {
      const request = await MoveRequest.findByPk(fixtures.seedId(`request:${fixture.key}`), { include: ['resident', 'unit', 'community', 'reviewer', 'details', 'checklistItems'] });
      assert.equal(request.status, fixture.stage.toUpperCase());
      assert.equal(request.type, fixture.type);
      assert.equal(request.resident.email, fixture.residentEmail);
      assert.equal(request.resident.unitId, request.unitId);
      assert.equal(request.unit.communityId, request.communityId);
      assert.equal(request.checklistItems.length, 2);
      assert.equal(request.details.vehicleCount, 1);
      const config = await CommunityWorkflowConfig.findOne({ where: { communityId: request.communityId, requestType: request.type } });
      const day = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${request.requestedDate}T00:00:00Z`).getUTCDay()];
      assert.ok(config.allowedDays.includes(day));
      assert.ok(config.allowedTimeSlots.some((slot) => `${slot.start}-${slot.end}` === request.requestedTimeSlot));
      if (fixture.stage === 'draft') assert.equal(request.submittedAt, null);
      else assert.ok(request.submittedAt >= request.createdAt);
      if (fixture.stage === 'approved') {
        assert.equal(request.reviewer.communityId, request.communityId);
        assert.ok(request.reviewedAt >= request.submittedAt);
        assert.ok(request.checklistItems.every((item) => item.status === 'COMPLETED'));
      } else assert.equal(request.reviewedBy, null);
    }

    const comment = await RequestComment.create({ moveRequestId: fixtures.seedId('request:green-draft-in'), authorType: 'ADMIN', comment: 'User-created record to retain' });
    await assert.rejects(seeder.down(), /non-seed records/);
    assert.equal(await RequestChecklist.count(), before[7] + 6, 'Failed revert must preserve all seed rows');
    assert.ok(await RequestComment.findByPk(comment.id));
    await comment.destroy();
    await seeder.down();
    for (let i = 0; i < expected.length; i++) assert.equal(await expected[i][0].count(), before[i]);
    assert.ok(await Community.findByPk(outsider.id));
    assert.equal((await seeder.down()).length, 0);

    const conflict = await Community.create({ name: 'Existing Green Heights', code: 'GREEN_HEIGHTS', address: 'Do not overwrite' });
    await assert.rejects(seeder.up(), /already exist/);
    assert.equal((await conflict.reload()).address, 'Do not overwrite');
    assert.equal(await Community.count({ where: { code: 'MARINA_RESIDENCE' } }), 0, 'Failed seed must be atomic');
    assert.equal((await seeder.executed()).length, 0);
    await conflict.destroy();
    await seeder.up();
    await seeder.down();
    console.log('PASS: seed data, lookups, request consistency, rerun, exact revert, conflicts and outside dependency protection');
  } finally {
    await seeder.down({ to: 0 });
    await outsider.destroy();
    await sequelize.getQueryInterface().dropTable('SequelizeSeedMeta');
  }
}

module.exports = { verifySeeds };
