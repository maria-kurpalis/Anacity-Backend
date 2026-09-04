import type { CommunityWorkflowConfig, Document, MoveRequest, MoveRequestDetails } from '../models';
import { DocumentStatus } from '../types/domain';
import { ApiError } from '../types/api';
import type { FieldError } from '../types/api';
import { isObject, validDate } from '../validation/move-request';
import { parseWorkflowRules, weekdays } from '../validation/workflow-config';
import type { WorkflowRules } from '../types/workflow-config';

const labels: Record<string, string> = {
  requestedDate: 'Requested date', requestedTimeSlot: 'Requested time slot',
  vehicleCount: 'Vehicle count', vehicleDetails: 'Vehicle details', occupantCount: 'Occupant count', notes: 'Notes',
};

function invalidConfig(): never {
  throw new ApiError(500, [{ field: 'workflowConfig', message: 'The community workflow configuration is invalid.' }]);
}

function missing(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim())
    || (Array.isArray(value) && !value.length) || (isObject(value) && !Object.keys(value).length);
}

export function validateWorkflow(
  config: CommunityWorkflowConfig,
  request: Pick<MoveRequest, 'requestedDate' | 'requestedTimeSlot'>,
  details: Pick<MoveRequestDetails, 'vehicleCount' | 'vehicleDetails' | 'occupantCount' | 'notes'> | null,
  documents: Document[],
): FieldError[] {
  let rules: WorkflowRules;
  try {
    rules = parseWorkflowRules({
      requiredFields: config.requiredFields, requiredDocuments: config.requiredDocuments,
      allowedDays: config.allowedDays, allowedTimeSlots: config.allowedTimeSlots,
    });
  } catch (error) {
    if (error instanceof ApiError) return invalidConfig();
    throw error;
  }
  const { requiredFields, requiredDocuments, allowedDays } = rules;
  const allowedTimeSlots = rules.allowedTimeSlots.map((slot) => `${slot.start}-${slot.end}`);

  const values: Record<string, unknown> = {
    requestedDate: request.requestedDate, requestedTimeSlot: request.requestedTimeSlot,
    vehicleCount: details?.vehicleCount,
    vehicleDetails: details?.vehicleDetails, occupantCount: details?.occupantCount, notes: details?.notes,
  };
  const errors: FieldError[] = [];
  for (const field of new Set(requiredFields)) {
    if (missing(values[field])) errors.push({ field, message: `${labels[field]} is required.` });
  }
  for (const documentType of new Set(requiredDocuments)) {
    const uploaded = documents.some((document) => document.documentType === documentType
      && document.status !== DocumentStatus.REJECTED && document.fileUrl.trim().length > 0);
    if (!uploaded) errors.push({ field: `documents.${documentType}`, message: `Upload a non-rejected ${documentType} document.` });
  }
  if (request.requestedDate !== null) {
    if (!validDate(request.requestedDate)) {
      errors.push({ field: 'requestedDate', message: 'Requested date is invalid.' });
    } else {
      const day = weekdays[new Date(`${request.requestedDate}T00:00:00.000Z`).getUTCDay()];
      if (!allowedDays.includes(day)) errors.push({ field: 'requestedDate', message: 'Moving is not allowed on this day for this community.' });
    }
  }
  if (request.requestedTimeSlot !== null && !allowedTimeSlots.includes(request.requestedTimeSlot)) {
    errors.push({ field: 'requestedTimeSlot', message: 'Choose a time slot allowed by this community.' });
  }
  return errors;
}
