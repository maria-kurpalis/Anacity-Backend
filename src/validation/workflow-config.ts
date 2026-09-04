import { ApiError } from '../types/api';
import { MoveRequestType } from '../types/domain';
import type { PutWorkflowConfigInput, WorkflowRules } from '../types/workflow-config';
import { bodyObject, editableFields, isObject, parseId, validTime } from './move-request';

export const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export function parseRequestType(value: unknown): MoveRequestType {
  if (value !== MoveRequestType.MOVE_IN && value !== MoveRequestType.MOVE_OUT) {
    throw new ApiError(400, [{ field: 'requestType', message: 'Request type must be MOVE_IN or MOVE_OUT.' }]);
  }
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim().length > 0 && !item.includes('\0'))) {
    throw new ApiError(400, [{ field, message: 'Use an array of nonempty strings.' }]);
  }
  return value.map((item: string) => item.trim());
}

// Shared by config writes and submission so stored rules have one interpretation.
export function parseWorkflowRules(value: Record<keyof WorkflowRules, unknown>): WorkflowRules {
  const requiredFields = stringList(value.requiredFields, 'requiredFields');
  if (requiredFields.some((field) => !(editableFields as readonly string[]).includes(field))) {
    throw new ApiError(400, [{ field: 'requiredFields', message: `Supported fields: ${editableFields.join(', ')}.` }]);
  }
  const requiredDocuments = stringList(value.requiredDocuments, 'requiredDocuments');
  if (requiredDocuments.some((type) => [...type].length > 100)) {
    throw new ApiError(400, [{ field: 'requiredDocuments', message: 'Each document type must be at most 100 characters.' }]);
  }
  const allowedDays = stringList(value.allowedDays, 'allowedDays');
  if (allowedDays.some((day) => !weekdays.includes(day))) {
    throw new ApiError(400, [{ field: 'allowedDays', message: 'Use uppercase weekday names such as MONDAY.' }]);
  }
  if (!Array.isArray(value.allowedTimeSlots)) {
    throw new ApiError(400, [{ field: 'allowedTimeSlots', message: 'Use an array of objects containing start and end.' }]);
  }
  const allowedTimeSlots = value.allowedTimeSlots.map((slot, index) => {
    if (!isObject(slot) || Object.keys(slot).some((key) => !['start', 'end'].includes(key))
      || !validTime(slot.start) || !validTime(slot.end) || slot.start >= slot.end) {
      throw new ApiError(400, [{ field: `allowedTimeSlots.${index}`, message: 'Use only start and end in HH:mm format, with start before end.' }]);
    }
    return { start: slot.start, end: slot.end };
  });
  return { requiredFields, requiredDocuments, allowedDays, allowedTimeSlots };
}

export function parsePutWorkflowConfigInput(value: unknown): PutWorkflowConfigInput {
  const body = bodyObject(value, ['adminId', 'requiredFields', 'requiredDocuments', 'allowedDays', 'allowedTimeSlots', 'instructions']);
  const adminId = parseId(body.adminId, 'adminId');
  const rules = parseWorkflowRules({
    requiredFields: body.requiredFields, requiredDocuments: body.requiredDocuments,
    allowedDays: body.allowedDays, allowedTimeSlots: body.allowedTimeSlots,
  });
  if (typeof body.instructions !== 'string') {
    throw new ApiError(400, [{ field: 'instructions', message: 'Instructions must be a string.' }]);
  }
  return { adminId, ...rules, instructions: body.instructions.trim() };
}
