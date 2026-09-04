import { createAuditLog } from './audit-log.service';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import {
  Resident, MoveRequest, MoveRequestDetails, CommunityWorkflowConfig, Document, StatusHistory,
  MoveRequestStatus, ActorType,
} from '../models';
import { ApiError } from '../types/api';
import { detailFields } from '../validation/move-request';
import type { CreateMoveRequestInput, UpdateMoveRequestInput } from '../types/move-request';
import { validateWorkflow } from './workflow-validation.service';
import { assertMoveRequestEditable, assertMoveRequestTransition } from './move-request-state.service';
import { lockMoveRequest, requireRequestResident } from './move-request-access.service';
import { notifyCommunityAdmins } from './notification.service';

function notFound(field: string, message: string): never {
  throw new ApiError(404, [{ field, message }]);
}

export async function createMoveRequest(input: CreateMoveRequestInput): Promise<MoveRequest> {
  return sequelize.transaction(async (transaction) => {
    const resident = await Resident.findByPk(input.residentId, { transaction, lock: transaction.LOCK.SHARE });
    if (!resident) return notFound('residentId', 'Resident not found.');
    return MoveRequest.create({
      residentId: resident.id, communityId: resident.communityId, unitId: resident.unitId,
      type: input.type, status: MoveRequestStatus.DRAFT,
      requestedDate: null, requestedTimeSlot: null,
    }, { transaction });
  });
}

export async function getResidentMoveRequests(residentId: string): Promise<MoveRequest[]> {
  if (!await Resident.findByPk(residentId, { attributes: ['id'] })) return notFound('residentId', 'Resident not found.');
  return MoveRequest.findAll({
    where: { residentId },
    include: [
      { association: 'community', attributes: ['id', 'name', 'code', 'address'] },
      { association: 'unit', attributes: ['id', 'unitNumber', 'tower', 'floor'] },
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

export async function getMoveRequestDetails(id: string): Promise<MoveRequest> {
  const request = await MoveRequest.findByPk(id, {
    include: [
      { association: 'resident' }, { association: 'community' }, { association: 'unit' }, { association: 'details' },
      { association: 'documents', separate: true, order: [['createdAt', 'ASC'], ['id', 'ASC']], include: [{ association: 'verifier', attributes: ['id', 'name'] }] },
      { association: 'checklistItems', separate: true, order: [['createdAt', 'ASC'], ['id', 'ASC']] },
      { association: 'comments', separate: true, order: [['createdAt', 'ASC'], ['id', 'ASC']] },
      { association: 'statusHistories', separate: true, order: [['createdAt', 'ASC'], ['id', 'ASC']] },
    ],
  });
  if (!request) return notFound('id', 'Move request not found.');
  return request;
}

export async function updateMoveRequest(id: string, input: UpdateMoveRequestInput): Promise<MoveRequest> {
  await sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    await applyMoveRequestUpdate(request, input, transaction);
  });
  return getMoveRequestDetails(id);
}

// The caller holds the parent row lock. HTTP PATCH and agent chat share this write path.
export async function applyMoveRequestUpdate(request: MoveRequest, input: UpdateMoveRequestInput, transaction: Transaction): Promise<void> {
  assertMoveRequestEditable(request.status);
  const schedule: Pick<UpdateMoveRequestInput, 'requestedDate' | 'requestedTimeSlot'> = {};
  if (Object.hasOwn(input, 'requestedDate')) schedule.requestedDate = input.requestedDate;
  if (Object.hasOwn(input, 'requestedTimeSlot')) schedule.requestedTimeSlot = input.requestedTimeSlot;
  if (Object.keys(schedule).length) await request.update(schedule, { transaction });
  const changes: Pick<UpdateMoveRequestInput, typeof detailFields[number]> = {};
  for (const field of detailFields) {
    // Object.assign preserves the field's validated value without mass assignment.
    if (Object.hasOwn(input, field)) Object.assign(changes, { [field]: input[field] });
  }
  if (Object.keys(changes).length) {
    const details = await MoveRequestDetails.findOne({ where: { moveRequestId: request.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (details) await details.update(changes, { transaction });
    else await MoveRequestDetails.create({ moveRequestId: request.id, ...changes }, { transaction });
  }
}

export async function submitMoveRequest(id: string): Promise<MoveRequest> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    assertMoveRequestTransition(request.status, MoveRequestStatus.SUBMITTED, 409);
    const config = await CommunityWorkflowConfig.findOne({
      where: { communityId: request.communityId, requestType: request.type },
      transaction, lock: transaction.LOCK.SHARE,
    });
    if (!config) throw new ApiError(409, [{ field: 'workflowConfig', message: 'No workflow configuration is available for this community and move type.' }]);
    const details = await MoveRequestDetails.findOne({ where: { moveRequestId: id }, transaction, lock: transaction.LOCK.SHARE });
    const documents = await Document.findAll({ where: { moveRequestId: id }, transaction, lock: transaction.LOCK.SHARE });
    const errors = validateWorkflow(config, request, details, documents);
    if (errors.length) throw new ApiError(422, errors);

    const previousStatus = request.status;
    const submittedAt = new Date();
    await request.update({
      status: MoveRequestStatus.SUBMITTED, submittedAt,
    }, { transaction });
    await StatusHistory.create({
      moveRequestId: id, fromStatus: previousStatus, toStatus: MoveRequestStatus.SUBMITTED,
      changedByType: ActorType.RESIDENT, changedById: request.residentId,
      reason: 'Submitted by resident.', createdAt: submittedAt,
    }, { transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.RESIDENT, actorId: request.residentId,
      action: 'MOVE_REQUEST_SUBMITTED', previousValue: { status: previousStatus },
      newValue: { status: MoveRequestStatus.SUBMITTED, submittedAt: submittedAt.toISOString() },
      metadata: null, createdAt: submittedAt,
      transaction,
    });
    await notifyCommunityAdmins(request, previousStatus === MoveRequestStatus.NEEDS_CHANGES, transaction);
    return request;
  });
}

export async function cancelMoveRequest(id: string, residentId: string, reason: string): Promise<MoveRequest> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    await requireRequestResident(residentId, request, transaction);
    assertMoveRequestTransition(request.status, MoveRequestStatus.CANCELLED, 409);
    const previousStatus = request.status;
    await request.update({ status: MoveRequestStatus.CANCELLED }, { transaction });
    await StatusHistory.create({ moveRequestId: id, fromStatus: previousStatus, toStatus: MoveRequestStatus.CANCELLED,
      changedByType: ActorType.RESIDENT, changedById: residentId, reason }, { transaction });
    await createAuditLog({ moveRequestId: id, actorType: ActorType.RESIDENT, actorId: residentId,
      action: 'MOVE_REQUEST_CANCELLED', previousValue: { status: previousStatus }, newValue: { status: request.status }, metadata: { reason }, transaction });
    await notifyCommunityAdmins(request, false, transaction, reason);
    return request;
  });
}
