import type { MoveRequestStatus, MoveRequestType } from './domain';

export interface CommunityRequestFilters {
  status?: MoveRequestStatus;
  type?: MoveRequestType;
  residentId?: string;
}

export interface AdminReviewInput {
  adminId: string;
}

export interface AdminApprovalInput extends AdminReviewInput {
  comment?: string;
}

export interface AdminReasonInput extends AdminReviewInput {
  reason: string;
}
