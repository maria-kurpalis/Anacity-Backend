import { MoveRequestType } from '../types/domain';
import { ApiError } from '../types/api';
import type { FieldError } from '../types/api';
import type { CreateMoveRequestInput, UpdateMoveRequestInput } from '../types/move-request';
import type { JsonData } from '../types/json';

export const editableFields = ['requestedDate', 'requestedTimeSlot', 'vehicleCount', 'vehicleDetails', 'occupantCount', 'notes'] as const;
export const detailFields = ['vehicleCount', 'vehicleDetails', 'occupantCount', 'notes'] as const;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, [{ field, message: `${field} must be a UUID.` }]);
  }
  return value;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validTimeSlot(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('-');
  return parts.length === 2 && validTime(parts[0]) && validTime(parts[1]) && parts[0] < parts[1];
}

export function bodyObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isObject(value)) throw new ApiError(400, [{ field: 'body', message: 'A JSON object is required.' }]);
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string' && item.includes('\0')) {
      throw new ApiError(400, [{ field: 'body', message: 'Text and JSON values cannot contain null characters.' }]);
    }
    if (Array.isArray(item)) pending.push(...item);
    else if (isObject(item)) pending.push(...Object.keys(item), ...Object.values(item));
  }
  const errors = Object.keys(value).filter((key) => !allowed.includes(key)).map((field) => ({ field, message: 'This field cannot be set through this endpoint.' }));
  if (errors.length) throw new ApiError(400, errors);
  return value;
}

export function parseCreateInput(value: unknown): CreateMoveRequestInput {
  const body = bodyObject(value, ['residentId', 'type']);
  const residentId = parseId(body.residentId, 'residentId');
  if (body.type !== MoveRequestType.MOVE_IN && body.type !== MoveRequestType.MOVE_OUT) {
    throw new ApiError(400, [{ field: 'type', message: 'Type must be MOVE_IN or MOVE_OUT.' }]);
  }
  return { residentId, type: body.type };
}

export function parseUpdateInput(value: unknown): UpdateMoveRequestInput {
  const body = bodyObject(value, editableFields);
  if (!Object.keys(body).length) throw new ApiError(400, [{ field: 'body', message: 'Provide at least one editable field.' }]);
  const result: UpdateMoveRequestInput = {};
  const errors: FieldError[] = [];
  for (const field of editableFields) {
    if (!Object.hasOwn(body, field)) continue;
    const raw = body[field];
    const input = typeof raw === 'string' ? raw.trim() : raw;
    if (input === null) { result[field] = null; continue; }
    switch (field) {
      case 'requestedDate':
        if (validDate(input)) result.requestedDate = input;
        else errors.push({ field, message: 'Use a valid date in YYYY-MM-DD format.' });
        break;
      case 'requestedTimeSlot':
        if (validTimeSlot(input)) result.requestedTimeSlot = input;
        else errors.push({ field, message: 'Use an increasing time range in HH:mm-HH:mm format.' });
        break;
      case 'vehicleCount':
      case 'occupantCount':
        if (typeof input === 'number' && Number.isInteger(input) && input >= 0 && input <= 2147483647) result[field] = input;
        else errors.push({ field, message: 'Use a nonnegative integer no greater than 2147483647.' });
        break;
      case 'vehicleDetails':
        if (isObject(input) || Array.isArray(input)) result.vehicleDetails = input as JsonData;
        else errors.push({ field, message: 'Vehicle details must be a JSON object or array.' });
        break;
      case 'notes':
        if (typeof input === 'string') result.notes = input;
        else errors.push({ field, message: 'Notes must be a string.' });
    }
  }
  if (errors.length) throw new ApiError(400, errors);
  return result;
}

export function validateSubmitBody(value: unknown): void {
  if (value !== undefined) bodyObject(value, []);
}

export function parseCancelInput(value: unknown): { residentId: string; reason: string } {
  const input = bodyObject(value, ['residentId', 'reason']);
  const residentId = parseId(input.residentId, 'residentId');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 8000) {
    throw new ApiError(400, [{ field: 'reason', message: 'A cancellation reason of 1–8000 characters is required.' }]);
  }
  return { residentId, reason: input.reason.trim() };
}
