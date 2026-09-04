import { ApiError } from '../types/api';
import { ChecklistStatus } from '../types/domain';
import type { AdminCommentInput, ResidentCommentInput, UpdateChecklistInput } from '../types/request-collaboration';
import { bodyObject, parseId } from './move-request';

export function parseUpdateChecklistInput(value: unknown): UpdateChecklistInput {
  const body = bodyObject(value, ['adminId', 'status']);
  const adminId = parseId(body.adminId, 'adminId');
  if (body.status !== ChecklistStatus.PENDING && body.status !== ChecklistStatus.COMPLETED && body.status !== ChecklistStatus.NOT_APPLICABLE) {
    throw new ApiError(400, [{ field: 'status', message: 'Status must be PENDING, COMPLETED or NOT_APPLICABLE.' }]);
  }
  return { adminId, status: body.status };
}

function parseComment(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, [{ field: 'comment', message: 'Comment must be nonempty text.' }]);
  }
  return value.trim();
}

export function parseResidentCommentInput(value: unknown): ResidentCommentInput {
  const body = bodyObject(value, ['residentId', 'comment']);
  return { residentId: parseId(body.residentId, 'residentId'), comment: parseComment(body.comment) };
}

export function parseAdminCommentInput(value: unknown): AdminCommentInput {
  const body = bodyObject(value, ['adminId', 'comment']);
  return { adminId: parseId(body.adminId, 'adminId'), comment: parseComment(body.comment) };
}
