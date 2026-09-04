import type { ChecklistStatus } from './domain';

export interface UpdateChecklistInput {
  adminId: string;
  status: ChecklistStatus;
}

export interface ResidentCommentInput {
  residentId: string;
  comment: string;
}

export interface AdminCommentInput {
  adminId: string;
  comment: string;
}
