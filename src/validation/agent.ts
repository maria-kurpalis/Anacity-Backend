import { ApiError } from '../types/api';
import { AgentAssessmentRecommendation } from '../types/domain';
import type { AgentAssessmentOutput, AgentChatInput, AgentChatOutput, AgentConversationQuery } from '../types/agent';
import { bodyObject, isObject, parseId, parseUpdateInput } from './move-request';

export function parseAgentChatInput(value: unknown): AgentChatInput {
  const body = bodyObject(value, ['residentId', 'message']);
  const residentId = parseId(body.residentId, 'residentId');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 8000) {
    throw new ApiError(400, [{ field: 'message', message: 'Message must be nonempty text of at most 8000 characters.' }]);
  }
  return { residentId, message: body.message.trim() };
}

export function parseAgentAdminQuery(value: unknown): string {
  if (!isObject(value) || Object.keys(value).some((key) => key !== 'adminId')) {
    throw new ApiError(400, [{ field: 'query', message: 'Supply only an adminId query parameter.' }]);
  }
  return parseId(value.adminId, 'adminId');
}

function positiveInteger(value: unknown, field: string, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new ApiError(400, [{ field, message: `${field} must be an integer between 1 and ${max}.` }]);
  }
  return Number(value);
}

export function parseAgentConversationQuery(value: unknown): AgentConversationQuery {
  if (!isObject(value) || Object.keys(value).some((key) => !['residentId', 'adminId', 'page', 'limit'].includes(key))) {
    throw new ApiError(400, [{ field: 'query', message: 'Use residentId or adminId, with optional page and limit.' }]);
  }
  if (Object.hasOwn(value, 'residentId') === Object.hasOwn(value, 'adminId')) {
    throw new ApiError(400, [{ field: 'identity', message: 'Supply exactly one residentId or adminId.' }]);
  }
  const identity = Object.hasOwn(value, 'residentId')
    ? { residentId: parseId(value.residentId, 'residentId') }
    : { adminId: parseId(value.adminId, 'adminId') };
  const page = positiveInteger(value.page, 'page', 1, 2147483647);
  const limit = positiveInteger(value.limit, 'limit', 20, 100);
  if ((page - 1) * limit > 2147483647) {
    throw new ApiError(400, [{ field: 'page', message: 'Pagination offset is too large.' }]);
  }
  return { identity, page, limit };
}

export function invalidAgentOutput(): never {
  throw new ApiError(502, [{ field: 'ai', message: 'AI returned an unusable response. No changes were saved; please retry.' }]);
}

function validText(value: unknown, max = 4000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
}

export function parseAgentChatOutput(value: unknown): AgentChatOutput {
  if (!isObject(value) || Object.keys(value).some((key) => !['message', 'extractedFields', 'missingFields', 'requiresClarification'].includes(key))
    || !validText(value.message) || !isObject(value.extractedFields) || typeof value.requiresClarification !== 'boolean'
    || !Array.isArray(value.missingFields) || value.missingFields.length > 100 || !value.missingFields.every((field) => validText(field, 150))) return invalidAgentOutput();
  try {
    const extractedFields = Object.keys(value.extractedFields).length ? parseUpdateInput(value.extractedFields) : {};
    // Null means not extracted; the agent cannot clear existing values implicitly.
    for (const [field, item] of Object.entries(extractedFields)) if (item === null) delete extractedFields[field as keyof typeof extractedFields];
    return { message: value.message.trim(), extractedFields, missingFields: value.missingFields, requiresClarification: value.requiresClarification };
  } catch { return invalidAgentOutput(); }
}

export function parseAgentAssessmentOutput(value: unknown): AgentAssessmentOutput {
  if (!isObject(value) || Object.keys(value).some((key) => !['recommendation', 'confidence', 'reasoning', 'issues'].includes(key))
    || !Object.values(AgentAssessmentRecommendation).includes(value.recommendation as AgentAssessmentRecommendation)
    || !(value.confidence === null || (typeof value.confidence === 'number' && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1))
    || !validText(value.reasoning, 3000) || !Array.isArray(value.issues) || value.issues.length > 100) return invalidAgentOutput();
  const issues = value.issues.map((issue) => {
    if (!isObject(issue) || Object.keys(issue).some((key) => !['field', 'message'].includes(key))
      || !validText(issue.field, 150) || !validText(issue.message, 1000)) return invalidAgentOutput();
    return { field: issue.field.trim(), message: issue.message.trim() };
  });
  return { recommendation: value.recommendation as AgentAssessmentRecommendation, confidence: value.confidence, reasoning: value.reasoning.trim(), issues };
}
