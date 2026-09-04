import { createAuditLog } from './audit-log.service';
import { sequelize } from '../config/database';
import {
  Community, MoveRequest, CommunityWorkflowConfig, StatusHistory, RequestComment,
  MoveRequestStatus, ActorType, CommentAuthorType,
} from '../models';
import { ApiError } from '../types/api';
import type { AdminApprovalInput, AdminReasonInput, AdminReviewInput, CommunityRequestFilters } from '../types/admin-move-request';
import { getMoveRequestDetails } from './move-request.service';
import { allowedAdminActions, assertMoveRequestTransition } from './move-request-state.service';
import { lockMoveRequest, requireCommunityAdmin } from './move-request-access.service';
import { notifyResidentOfDecision } from './notification.service';

export async function getCommunityMoveRequests(communityId: string, filters: CommunityRequestFilters): Promise<MoveRequest[]> {
  if (!await Community.findByPk(communityId, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'communityId', message: 'Community not found.' }]);
  }
  return MoveRequest.findAll({
    where: {
      communityId,
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.type === undefined ? {} : { type: filters.type }),
      ...(filters.residentId === undefined ? {} : { residentId: filters.residentId }),
    },
    include: [
      { association: 'resident', attributes: ['id', 'name', 'email', 'phone', 'residentType'] },
      { association: 'unit', attributes: ['id', 'unitNumber', 'tower', 'floor'] },
      { association: 'details' },
    ],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

export async function getRequestForAdminReview(id: string, adminId?: string) {
  if (adminId) await sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    await requireCommunityAdmin(adminId, request.communityId, transaction);
  });
  const request = await getMoveRequestDetails(id);
  const workflowConfig = await CommunityWorkflowConfig.findOne({
    where: { communityId: request.communityId, requestType: request.type },
  });
  return { ...request.toJSON(), workflowConfig, allowedActions: allowedAdminActions(request.status) };
}

interface ReviewDecision {
  status: MoveRequestStatus;
  action: string;
  comment?: string;
}

async function applyReviewDecision(id: string, adminId: string, decision: ReviewDecision): Promise<MoveRequest> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const admin = await requireCommunityAdmin(adminId, request.communityId, transaction);
    assertMoveRequestTransition(request.status, decision.status);
    const previousStatus = request.status;
    const previousValue = {
      status: previousStatus, reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt?.toISOString() ?? null, rejectionReason: request.rejectionReason,
    };
    const reviewedAt = new Date();
    await request.update({
      status: decision.status,
      // Completing a move records a new event while preserving the approval's reviewer.
      ...(decision.status === MoveRequestStatus.COMPLETED ? {} : { reviewedBy: admin.id, reviewedAt }),
      ...(decision.status === MoveRequestStatus.REJECTED ? { rejectionReason: decision.comment } : {}),
    }, { transaction });
    if (decision.comment !== undefined) {
      await RequestComment.create({
        moveRequestId: id, authorType: CommentAuthorType.ADMIN, authorId: admin.id,
        comment: decision.comment, createdAt: reviewedAt,
      }, { transaction });
    }
    await StatusHistory.create({
      moveRequestId: id, fromStatus: previousStatus, toStatus: decision.status,
      changedByType: ActorType.ADMIN, changedById: admin.id,
      reason: decision.comment ?? null, createdAt: reviewedAt,
    }, { transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.ADMIN, actorId: admin.id, action: decision.action,
      previousValue,
      newValue: {
        status: request.status, reviewedBy: request.reviewedBy, reviewedAt: request.reviewedAt?.toISOString() ?? null,
        rejectionReason: request.rejectionReason,
      },
      metadata: decision.comment === undefined ? null : { comment: decision.comment }, createdAt: reviewedAt,
      transaction,
    });
    await notifyResidentOfDecision(request, decision.comment, transaction);
    return request;
  });
}

export function startReview(id: string, input: AdminReviewInput): Promise<MoveRequest> {
  return applyReviewDecision(id, input.adminId, {
    status: MoveRequestStatus.UNDER_REVIEW, action: 'MOVE_REQUEST_REVIEW_STARTED',
  });
}

export function approveRequest(id: string, input: AdminApprovalInput): Promise<MoveRequest> {
  return applyReviewDecision(id, input.adminId, {
    status: MoveRequestStatus.APPROVED, action: 'MOVE_REQUEST_APPROVED', comment: input.comment,
  });
}

export function requestChanges(id: string, input: AdminReasonInput): Promise<MoveRequest> {
  return applyReviewDecision(id, input.adminId, {
    status: MoveRequestStatus.NEEDS_CHANGES, action: 'MOVE_REQUEST_CHANGES_REQUESTED', comment: input.reason,
  });
}

export function rejectRequest(id: string, input: AdminReasonInput): Promise<MoveRequest> {
  return applyReviewDecision(id, input.adminId, {
    status: MoveRequestStatus.REJECTED, action: 'MOVE_REQUEST_REJECTED', comment: input.reason,
  });
}

export function completeRequest(id: string, input: AdminApprovalInput): Promise<MoveRequest> {
  return applyReviewDecision(id, input.adminId, {
    status: MoveRequestStatus.COMPLETED, action: 'MOVE_REQUEST_COMPLETED', comment: input.comment,
  });
}
