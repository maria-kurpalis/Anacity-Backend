import { ActorType } from '../types/domain';
import { ApiError } from '../types/api';
import type { AuditLogQuery } from '../types/request-history';
import { isObject, parseId } from './move-request';

export function parseAuditLogQuery(value: unknown): AuditLogQuery {
  if (!isObject(value)) throw new ApiError(400, [{ field: 'query', message: 'Invalid query parameters.' }]);
  const errors = Object.keys(value).filter((key) => !['adminId', 'actorType', 'action'].includes(key))
    .map((field) => ({ field, message: 'Unsupported query parameter.' }));
  if (errors.length) throw new ApiError(400, errors);
  const result: AuditLogQuery = { adminId: parseId(value.adminId, 'adminId') };
  if (Object.hasOwn(value, 'actorType')) {
    if (!Object.values(ActorType).includes(value.actorType as ActorType)) {
      throw new ApiError(400, [{ field: 'actorType', message: 'Actor type must be RESIDENT, ADMIN, AGENT or SYSTEM.' }]);
    }
    result.actorType = value.actorType as ActorType;
  }
  if (Object.hasOwn(value, 'action')) {
    if (typeof value.action !== 'string' || !value.action.trim() || [...value.action.trim()].length > 255 || value.action.includes('\0')) {
      throw new ApiError(400, [{ field: 'action', message: 'Action must be nonempty text of at most 255 characters.' }]);
    }
    result.action = value.action.trim();
  }
  return result;
}
