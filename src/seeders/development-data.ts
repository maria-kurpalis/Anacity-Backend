import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import type { Transaction } from 'sequelize';
import {
  Community, Unit, Resident, Admin, CommunityWorkflowConfig, MoveRequest, MoveRequestDetails, RequestChecklist,
  MoveRequestStatus, ChecklistStatus, ChecklistCompletedByType,
} from '../models';
import { communities, units, residents, admins, workflowConfigs, requestFixtures, checklistKeys, seedId } from './fixtures/local-workflow';

async function communityByCode(code: string, transaction: Transaction): Promise<Community> {
  const community = await Community.findOne({ where: { code }, transaction });
  if (!community) throw new Error(`Seed community not found: ${code}`);
  return community;
}

// Use future dates in the allowed weekday window so fixtures remain useful later.
function nextMonday(now: Date): Date {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
  return monday;
}

export async function seedDevelopmentData(): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    // Do not adopt or overwrite an existing community that happens to share a code.
    const conflicts = await Community.count({ where: { code: { [Op.in]: communities.map(({ code }) => code) } }, transaction });
    if (conflicts) throw new Error('Local seed community codes already exist. Revert the tracked seed or use a separate local database.');

    await Community.bulkCreate(communities.map((community) => ({ ...community, id: seedId(`community:${community.code}`) })), { transaction });
    for (const { communityCode, ...unit } of units) {
      const community = await communityByCode(communityCode, transaction);
      await Unit.create({ ...unit, id: seedId(`unit:${communityCode}:${unit.unitNumber}`), communityId: community.id, isActive: true }, { transaction });
    }
    for (const { communityCode, unitNumber, tower, ...resident } of residents) {
      const community = await communityByCode(communityCode, transaction);
      const unit = await Unit.findOne({ where: { communityId: community.id, unitNumber, tower }, transaction });
      if (!unit) throw new Error(`Seed unit not found: ${communityCode}/${unitNumber}`);
      await Resident.create({ ...resident, id: seedId(`resident:${resident.email}`), communityId: community.id, unitId: unit.id, isActive: true }, { transaction });
    }
    for (const { communityCode, ...admin } of admins) {
      const community = await communityByCode(communityCode, transaction);
      await Admin.create({ ...admin, id: seedId(`admin:${admin.email}`), communityId: community.id, isActive: true }, { transaction });
    }
    for (const { communityCode, ...config } of workflowConfigs) {
      const community = await communityByCode(communityCode, transaction);
      await CommunityWorkflowConfig.create({ ...config, id: seedId(`workflow:${communityCode}:${config.requestType}`), communityId: community.id }, { transaction });
    }

    const now = new Date();
    const monday = nextMonday(now);
    for (const fixture of requestFixtures) {
      const community = await communityByCode(fixture.communityCode, transaction);
      // Emails are not unique in the current schema; require exactly one scoped match.
      const matches = await Resident.findAll({ where: { communityId: community.id, email: fixture.residentEmail }, limit: 2, transaction });
      if (matches.length !== 1) throw new Error(`Ambiguous or missing seed resident: ${fixture.residentEmail}`);
      const resident = matches[0];
      const adminEmail = admins.find(({ communityCode }) => communityCode === fixture.communityCode)!.email;
      const reviewers = await Admin.findAll({ where: { communityId: community.id, email: adminEmail }, limit: 2, transaction });
      if (reviewers.length !== 1) throw new Error(`Ambiguous or missing seed admin: ${adminEmail}`);
      const admin = reviewers[0];
      const submitted = fixture.stage !== 'draft';
      const approved = fixture.stage === 'approved';
      const submittedAt = submitted ? new Date(now.getTime() - (approved ? 2 : 1) * 86400000) : null;
      const reviewedAt = approved ? new Date(now.getTime() - 86400000) : null;
      const createdAt = submittedAt ? new Date(submittedAt.getTime() - 3600000) : now;
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + fixture.dayOffset);
      const request = await MoveRequest.create({
        id: seedId(`request:${fixture.key}`), residentId: resident.id, communityId: community.id, unitId: resident.unitId,
        type: fixture.type, status: approved ? MoveRequestStatus.APPROVED : submitted ? MoveRequestStatus.SUBMITTED : MoveRequestStatus.DRAFT,
        requestedDate: date.toISOString().slice(0, 10), requestedTimeSlot: fixture.requestedTimeSlot,
        submittedAt, reviewedBy: approved ? admin.id : null, reviewedAt, rejectionReason: null,
        createdAt, updatedAt: reviewedAt ?? submittedAt ?? now,
      }, { transaction });
      await MoveRequestDetails.create({
        id: seedId(`details:${fixture.key}`), moveRequestId: request.id, movingCompany: null,
        vehicleCount: 1, vehicleDetails: [{ vehicleType: 'SMALL_TRUCK', registrationNumber: 'KA-01-DE-1234' }],
        occupantCount: fixture.occupantCount, notes: 'Local sample request. Coordinate service lift access with security.',
        createdAt, updatedAt: submittedAt ?? now,
      }, { transaction });
      await RequestChecklist.bulkCreate([
        {
          id: seedId(`checklist:${fixture.key}:MOVE_DETAILS`), moveRequestId: request.id, key: 'MOVE_DETAILS', label: 'Confirm move details',
          status: submitted ? ChecklistStatus.COMPLETED : ChecklistStatus.PENDING,
          completedByType: submitted ? ChecklistCompletedByType.RESIDENT : null, completedById: submitted ? resident.id : null,
          completedAt: submittedAt, createdAt, updatedAt: submittedAt ?? now,
        },
        {
          id: seedId(`checklist:${fixture.key}:ADMIN_REVIEW`), moveRequestId: request.id, key: 'ADMIN_REVIEW', label: 'Review move request',
          status: approved ? ChecklistStatus.COMPLETED : ChecklistStatus.PENDING,
          completedByType: approved ? ChecklistCompletedByType.ADMIN : null, completedById: approved ? admin.id : null,
          completedAt: reviewedAt, createdAt, updatedAt: reviewedAt ?? submittedAt ?? now,
        },
      ], { transaction });
    }
  });
}

export async function revertDevelopmentData(): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const ownedIds: Record<string, string[]> = {
      communities: communities.map(({ code }) => seedId(`community:${code}`)),
      units: units.map(({ communityCode, unitNumber }) => seedId(`unit:${communityCode}:${unitNumber}`)),
      residents: residents.map(({ email }) => seedId(`resident:${email}`)),
      admins: admins.map(({ email }) => seedId(`admin:${email}`)),
      community_workflow_configs: workflowConfigs.map(({ communityCode, requestType }) => seedId(`workflow:${communityCode}:${requestType}`)),
      move_requests: requestFixtures.map(({ key }) => seedId(`request:${key}`)),
      move_request_details: requestFixtures.map(({ key }) => seedId(`details:${key}`)),
      request_checklists: requestFixtures.flatMap(({ key }) => checklistKeys.map((item) => seedId(`checklist:${key}:${item}`))),
    };
    // Catch outside references before ON DELETE SET NULL can modify unrelated rows.
    for (const model of Object.values(sequelize.models)) {
      const tableName = model.getTableName();
      const table = typeof tableName === 'string' ? tableName : tableName.tableName;
      for (const [field, attribute] of Object.entries(model.getAttributes())) {
        const reference = attribute.references;
        if (typeof reference !== 'object' || typeof reference.model !== 'string') continue;
        const parentIds = ownedIds[reference.model];
        if (!parentIds) continue;
        const count = await model.count({
          where: {
            [field]: { [Op.in]: parentIds },
            ...(ownedIds[table] ? { id: { [Op.notIn]: ownedIds[table] } } : {}),
          },
          transaction,
        });
        if (count) throw new Error(`Cannot revert local seeds: non-seed records in ${table} reference sample data. Use db:reset for a disposable development database.`);
      }
    }
    // Delete exact seed-owned primary keys in reverse dependency order.
    // User-added dependents (including immutable history) intentionally block revert;
    // the transaction then restores every deletion rather than erasing that history.
    await RequestChecklist.destroy({ where: { id: ownedIds.request_checklists }, transaction });
    await MoveRequestDetails.destroy({ where: { id: ownedIds.move_request_details }, transaction });
    await MoveRequest.destroy({ where: { id: ownedIds.move_requests }, transaction });
    await CommunityWorkflowConfig.destroy({ where: { id: ownedIds.community_workflow_configs }, transaction });
    await Resident.destroy({ where: { id: ownedIds.residents }, transaction });
    await Admin.destroy({ where: { id: ownedIds.admins }, transaction });
    await Unit.destroy({ where: { id: ownedIds.units }, transaction });
    await Community.destroy({ where: { id: ownedIds.communities }, transaction });
  });
}
