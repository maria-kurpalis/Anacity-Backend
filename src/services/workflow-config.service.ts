import { createAuditLog } from './audit-log.service';
import { sequelize } from '../config/database';
import { Community, CommunityWorkflowConfig, ActorType } from '../models';
import { ApiError } from '../types/api';
import type { MoveRequestType } from '../types/domain';
import type { PutWorkflowConfigInput } from '../types/workflow-config';
import { requireCommunityAdmin } from './move-request-access.service';

function configSnapshot(config: CommunityWorkflowConfig) {
  return {
    id: config.id, communityId: config.communityId, requestType: config.requestType,
    requiredFields: config.requiredFields, requiredDocuments: config.requiredDocuments,
    allowedDays: config.allowedDays, allowedTimeSlots: config.allowedTimeSlots, instructions: config.instructions,
  };
}

export async function getWorkflowConfig(communityId: string, requestType: MoveRequestType): Promise<CommunityWorkflowConfig> {
  const config = await CommunityWorkflowConfig.findOne({ where: { communityId, requestType } });
  if (!config) throw new ApiError(404, [{ field: 'workflowConfig', message: 'Workflow configuration not found for this community and request type.' }]);
  return config;
}

export async function putWorkflowConfig(communityId: string, requestType: MoveRequestType, input: PutWorkflowConfigInput): Promise<CommunityWorkflowConfig> {
  return sequelize.transaction(async (transaction) => {
    // Serialize creation as well as updates, including when the config row does not yet exist.
    const community = await Community.findByPk(communityId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!community) throw new ApiError(404, [{ field: 'communityId', message: 'Community not found.' }]);
    const admin = await requireCommunityAdmin(input.adminId, community.id, transaction);
    let config = await CommunityWorkflowConfig.findOne({
      where: { communityId, requestType }, transaction, lock: transaction.LOCK.UPDATE,
    });
    const previousValue = config ? configSnapshot(config) : null;
    const { adminId: _adminId, ...values } = input;
    if (config) await config.update(values, { transaction });
    else config = await CommunityWorkflowConfig.create({ communityId, requestType, ...values }, { transaction });
    await createAuditLog({
      moveRequestId: null, actorType: ActorType.ADMIN, actorId: admin.id,
      action: previousValue ? 'WORKFLOW_CONFIG_UPDATED' : 'WORKFLOW_CONFIG_CREATED',
      previousValue, newValue: configSnapshot(config), metadata: { communityId, requestType, workflowConfigId: config.id },
      transaction,
    });
    return config;
  });
}
