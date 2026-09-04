import { MoveRequestStatus, MoveRequestType } from '../types/domain';
import { ApiError } from '../types/api';
import type { AdminApprovalInput, AdminReasonInput, AdminReviewInput, CommunityRequestFilters } from '../types/admin-move-request';
import { bodyObject, isObject, parseId } from './move-request';

export function parseCommunityRequestFilters(value: unknown): CommunityRequestFilters {
  if (!isObject(value)) throw new ApiError(400, [{ field: 'query', message: 'Invalid query parameters.' }]);
  const errors = Object.keys(value).filter((key) => !['status', 'type', 'residentId'].includes(key))
    .map((field) => ({ field, message: 'Unsupported query parameter.' }));
  if (errors.length) throw new ApiError(400, errors);
  const filters: CommunityRequestFilters = {};
  if (Object.hasOwn(value, 'status')) {
    if (!Object.values(MoveRequestStatus).includes(value.status as MoveRequestStatus)) {
      throw new ApiError(400, [{ field: 'status', message: 'Status must be a valid move request status.' }]);
    }
    filters.status = value.status as MoveRequestStatus;
  }
  if (Object.hasOwn(value, 'type')) {
    if (!Object.values(MoveRequestType).includes(value.type as MoveRequestType)) {
      throw new ApiError(400, [{ field: 'type', message: 'Type must be MOVE_IN or MOVE_OUT.' }]);
    }
    filters.type = value.type as MoveRequestType;
  }
  if (Object.hasOwn(value, 'residentId')) filters.residentId = parseId(value.residentId, 'residentId');
  return filters;
}

function parseText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, [{ field, message: `${field === 'reason' ? 'Reason' : 'Comment'} must be nonempty text.` }]);
  }
  return value.trim();
}

export function parseReviewInput(value: unknown): AdminReviewInput {
  const body = bodyObject(value, ['adminId']);
  return { adminId: parseId(body.adminId, 'adminId') };
}

export function parseApprovalInput(value: unknown): AdminApprovalInput {
  const body = bodyObject(value, ['adminId', 'comment']);
  const input: AdminApprovalInput = { adminId: parseId(body.adminId, 'adminId') };
  if (Object.hasOwn(body, 'comment')) input.comment = parseText(body.comment, 'comment');
  return input;
}

export function parseReasonInput(value: unknown): AdminReasonInput {
  const body = bodyObject(value, ['adminId', 'reason']);
  return { adminId: parseId(body.adminId, 'adminId'), reason: parseText(body.reason, 'reason') };
}
