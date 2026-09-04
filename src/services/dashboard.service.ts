import { Community, Resident, MoveRequest, MoveRequestStatus, MoveRequestType } from '../models';
import { ApiError } from '../types/api';
import type { AdminDashboard, ResidentDashboard } from '../types/dashboard';

type RequestScope = { residentId: string } | { communityId: string };

async function countRequests(where: RequestScope) {
  // Only status/type groups reach application memory, never all matching requests.
  const groups = await MoveRequest.count({ where, group: ['status', 'type'] });
  const statuses: Partial<Record<MoveRequestStatus, number>> = {};
  const types: Partial<Record<MoveRequestType, number>> = {};
  let total = 0;
  for (const group of groups) {
    const count = Number(group.count);
    const status = group.status as MoveRequestStatus;
    const type = group.type as MoveRequestType;
    statuses[status] = (statuses[status] ?? 0) + count;
    types[type] = (types[type] ?? 0) + count;
    total += count;
  }
  return { total, statuses, types };
}

function recentRequests(where: RequestScope): Promise<MoveRequest[]> {
  return MoveRequest.findAll({
    where, limit: 5, order: [['createdAt', 'DESC'], ['id', 'DESC']],
    attributes: ['id', 'residentId', 'communityId', 'unitId', 'type', 'status', 'requestedDate', 'requestedTimeSlot', 'createdAt', 'updatedAt'],
    include: [
      { association: 'resident', attributes: ['id', 'name'] },
      { association: 'unit', attributes: ['id', 'unitNumber', 'tower', 'floor'] },
      { association: 'community', attributes: ['id', 'name', 'code'] },
    ],
  });
}

export async function getResidentDashboard(residentId: string): Promise<ResidentDashboard> {
  const resident = await Resident.findByPk(residentId, {
    attributes: ['id', 'name'],
    include: [
      { association: 'community', attributes: ['id', 'name', 'code'] },
      { association: 'unit', attributes: ['id', 'unitNumber', 'tower', 'floor'] },
    ],
  });
  if (!resident) {
    throw new ApiError(404, [{ field: 'residentId', message: 'Resident not found.' }]);
  }
  const scope = { residentId };
  const { total, statuses } = await countRequests(scope);
  return {
    resident: { id: resident.id, name: resident.name }, community: resident.community ?? null, unit: resident.unit ?? null,
    totalRequests: total, draftRequests: statuses.DRAFT ?? 0, submittedRequests: statuses.SUBMITTED ?? 0,
    needsChangesRequests: statuses.NEEDS_CHANGES ?? 0, approvedRequests: statuses.APPROVED ?? 0,
    rejectedRequests: statuses.REJECTED ?? 0, completedRequests: statuses.COMPLETED ?? 0,
    recentRequests: await recentRequests(scope),
  };
}

export async function getAdminDashboard(communityId: string): Promise<AdminDashboard> {
  const community = await Community.findByPk(communityId, { attributes: ['id', 'name', 'code'] });
  if (!community) {
    throw new ApiError(404, [{ field: 'communityId', message: 'Community not found.' }]);
  }
  const scope = { communityId };
  const { total, statuses, types } = await countRequests(scope);
  return {
    community,
    totalRequests: total, submittedRequests: statuses.SUBMITTED ?? 0, underReviewRequests: statuses.UNDER_REVIEW ?? 0,
    needsChangesRequests: statuses.NEEDS_CHANGES ?? 0, approvedRequests: statuses.APPROVED ?? 0,
    rejectedRequests: statuses.REJECTED ?? 0, completedRequests: statuses.COMPLETED ?? 0,
    moveInRequests: types.MOVE_IN ?? 0, moveOutRequests: types.MOVE_OUT ?? 0,
    recentRequests: await recentRequests(scope),
  };
}
