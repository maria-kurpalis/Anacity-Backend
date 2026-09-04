import { MoveRequestStatus } from '../types/domain';
import { ApiError } from '../types/api';

const editableStatuses: readonly MoveRequestStatus[] = [MoveRequestStatus.DRAFT, MoveRequestStatus.NEEDS_CHANGES];

// Only transitions implemented by the resident/admin actions are permitted.
// Resubmission must pass through SUBMITTED and start a new review before a decision.
const transitionSources: Partial<Record<MoveRequestStatus, readonly MoveRequestStatus[]>> = {
  [MoveRequestStatus.SUBMITTED]: editableStatuses,
  [MoveRequestStatus.UNDER_REVIEW]: [MoveRequestStatus.SUBMITTED],
  [MoveRequestStatus.APPROVED]: [MoveRequestStatus.UNDER_REVIEW],
  [MoveRequestStatus.NEEDS_CHANGES]: [MoveRequestStatus.UNDER_REVIEW],
  [MoveRequestStatus.REJECTED]: [MoveRequestStatus.UNDER_REVIEW],
  [MoveRequestStatus.COMPLETED]: [MoveRequestStatus.APPROVED],
  [MoveRequestStatus.CANCELLED]: [MoveRequestStatus.DRAFT, MoveRequestStatus.SUBMITTED, MoveRequestStatus.NEEDS_CHANGES],
};

export function assertMoveRequestEditable(status: MoveRequestStatus): void {
  if (!isMoveRequestEditable(status)) {
    throw new ApiError(409, [{ field: 'status', message: 'Only DRAFT or NEEDS_CHANGES requests can be edited.' }]);
  }
}

export function isMoveRequestEditable(status: MoveRequestStatus): boolean {
  return editableStatuses.includes(status);
}

export function canMoveRequestTransition(from: MoveRequestStatus, to: MoveRequestStatus): boolean {
  return transitionSources[to]?.includes(from) ?? false;
}

export function allowedAdminActions(status: MoveRequestStatus) {
  const targets = {
    review: MoveRequestStatus.UNDER_REVIEW, approve: MoveRequestStatus.APPROVED,
    'request-changes': MoveRequestStatus.NEEDS_CHANGES, reject: MoveRequestStatus.REJECTED, complete: MoveRequestStatus.COMPLETED,
  } as const;
  return (Object.keys(targets) as (keyof typeof targets)[]).filter((action) => canMoveRequestTransition(status, targets[action]));
}

export function assertMoveRequestTransition(from: MoveRequestStatus, to: MoveRequestStatus, errorStatus: 400 | 409 = 400): void {
  const sources = transitionSources[to];
  if (!canMoveRequestTransition(from, to)) {
    throw new ApiError(errorStatus, [{
      field: 'status',
      message: `Cannot change status from ${from} to ${to}.${sources ? ` Allowed current statuses: ${sources.join(', ')}.` : ''}`,
    }]);
  }
}
