import type { JsonObject } from './json';
import type { UpdateMoveRequestInput } from './move-request';
import type { AgentAssessmentRecommendation } from './domain';
import type { FieldError } from './api';

export interface AgentChatInput { residentId: string; message: string }

export type AgentIdentity = { residentId: string } | { adminId: string };

export interface AgentConversationQuery {
  identity: AgentIdentity;
  page: number;
  limit: number;
}

export interface AgentChatOutput {
  message: string;
  extractedFields: UpdateMoveRequestInput;
  missingFields: string[];
  requiresClarification: boolean;
}

export interface AgentAssessmentOutput {
  recommendation: AgentAssessmentRecommendation;
  confidence: number | null;
  reasoning: string;
  issues: FieldError[];
}

export interface AIProvider {
  chat(input: { context: JsonObject; message: string }): Promise<unknown>;
  generateAssessment(input: { context: JsonObject }): Promise<unknown>;
}
