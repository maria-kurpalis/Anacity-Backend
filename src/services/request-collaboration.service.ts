import { createAuditLog } from './audit-log.service';
import { sequelize } from '../config/database';
import { MoveRequest, RequestChecklist, RequestComment, ActorType, ChecklistStatus, ChecklistCompletedByType, CommentAuthorType } from '../models';
import { ApiError } from '../types/api';
import type { AdminCommentInput, ResidentCommentInput, UpdateChecklistInput } from '../types/request-collaboration';
import { lockMoveRequest, requireCommunityAdmin, requireRequestResident } from './move-request-access.service';

async function requireRequest(id: string): Promise<void> {
  if (!await MoveRequest.findByPk(id, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'id', message: 'Move request not found.' }]);
  }
}

export async function getRequestChecklist(id: string): Promise<RequestChecklist[]> {
  await requireRequest(id);
  return RequestChecklist.findAll({ where: { moveRequestId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
}

function checklistSnapshot(item: RequestChecklist) {
  return {
    id: item.id, key: item.key, label: item.label, status: item.status,
    completedByType: item.completedByType, completedById: item.completedById,
    completedAt: item.completedAt?.toISOString() ?? null,
  };
}

export async function updateChecklistItem(id: string, checklistId: string, input: UpdateChecklistInput): Promise<RequestChecklist> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const admin = await requireCommunityAdmin(input.adminId, request.communityId, transaction);
    const item = await RequestChecklist.findOne({ where: { id: checklistId, moveRequestId: id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw new ApiError(404, [{ field: 'checklistId', message: 'Checklist item not found for this move request.' }]);
    const previousValue = checklistSnapshot(item);
    const completed = input.status === ChecklistStatus.COMPLETED;
    await item.update({
      status: input.status,
      completedByType: completed ? ChecklistCompletedByType.ADMIN : null,
      completedById: completed ? admin.id : null, completedAt: completed ? new Date() : null,
    }, { transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.ADMIN, actorId: admin.id, action: 'CHECKLIST_ITEM_UPDATED',
      previousValue, newValue: checklistSnapshot(item), metadata: { checklistId },
      transaction,
    });
    return item;
  });
}

export async function getRequestComments(id: string): Promise<RequestComment[]> {
  await requireRequest(id);
  return RequestComment.findAll({ where: { moveRequestId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
}

export async function addResidentComment(id: string, input: ResidentCommentInput): Promise<RequestComment> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const resident = await requireRequestResident(input.residentId, request, transaction);
    return RequestComment.create({
      moveRequestId: id, authorType: CommentAuthorType.RESIDENT, authorId: resident.id, comment: input.comment,
    }, { transaction });
  });
}

export async function addAdminComment(id: string, input: AdminCommentInput): Promise<RequestComment> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const admin = await requireCommunityAdmin(input.adminId, request.communityId, transaction);
    return RequestComment.create({
      moveRequestId: id, authorType: CommentAuthorType.ADMIN, authorId: admin.id, comment: input.comment,
    }, { transaction });
  });
}
