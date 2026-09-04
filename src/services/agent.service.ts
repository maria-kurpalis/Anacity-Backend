import { randomUUID } from 'node:crypto';
import { sequelize } from '../config/database';
import { getAIConfig } from '../config/ai';
import { AgentConversation, AgentAssessment, AgentConversationRole, AgentAssessmentRecommendation, AgentToolExecution, AgentToolExecutionStatus } from '../models';
import { ApiError } from '../types/api';
import type { AgentChatInput } from '../types/agent';
import type { UpdateMoveRequestInput } from '../types/move-request';
import { parseAgentAssessmentOutput, parseAgentChatOutput } from '../validation/agent';
import { getAIProvider } from './ai/provider';
import { jsonObject, buildMoveRequestAgentContext } from './agent-context.service';
import { applyMoveRequestUpdate } from './move-request.service';
import { lockMoveRequest, requireCommunityAdmin } from './move-request-access.service';
import { validateWorkflow } from './workflow-validation.service';
import { isMoveRequestEditable } from './move-request-state.service';

function referenceClock() {
  const { timeZone } = getAIConfig();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, timeZone };
}

async function providerCall(operation: () => Promise<unknown>): Promise<unknown> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, [{ field: 'ai', message: 'AI service is unavailable. No changes were saved; please retry.' }]);
  }
}

function assertUnchanged(expected: string, actual: string): void {
  if (expected !== actual) throw new ApiError(409, [{ field: 'context', message: 'The request or its context changed during AI processing. No AI changes were saved; please retry.' }]);
}

export async function chatWithResident(id: string, input: AgentChatInput) {
  const identity = { residentId: input.residentId };
  const initial = await buildMoveRequestAgentContext(id, { identity });
  const provider = getAIProvider();
  const output = parseAgentChatOutput(await providerCall(() => provider.chat({
    context: { ...initial.context, referenceClock: referenceClock() }, message: input.message,
  })));
  return sequelize.transaction(async (transaction) => {
    const current = await buildMoveRequestAgentContext(id, { identity, transaction });
    assertUnchanged(initial.fingerprint, current.fingerprint);
    let appliedFields: UpdateMoveRequestInput = {};
    let validationErrors = current.errors;
    const proposed = output.extractedFields;
    const hasProposal = Object.keys(proposed).length > 0;
    // Vague dates must not become silently selected dates even if the provider guesses.
    if ((proposed.requestedDate || proposed.requestedTimeSlot) && /\b(sometime|some time|someday|whenever|not sure|unsure|weekend)\b/i.test(input.message)) {
      output.requiresClarification = true;
      output.message = 'Which exact move date and approved time slot would you like? I have not changed your request.';
    }
    if (hasProposal && !output.requiresClarification) {
      if (!isMoveRequestEditable(current.request.status)) {
        validationErrors = [...validationErrors, { field: 'status', message: 'Only DRAFT or NEEDS_CHANGES requests can be edited.' }];
      } else if (!current.errors.some((error) => error.field === 'workflowConfig') && current.config) {
        const candidateRequest = {
          requestedDate: proposed.requestedDate ?? current.request.requestedDate,
          requestedTimeSlot: proposed.requestedTimeSlot ?? current.request.requestedTimeSlot,
        };
        const candidateDetails = {
          vehicleCount: proposed.vehicleCount ?? current.details?.vehicleCount ?? null,
          vehicleDetails: proposed.vehicleDetails ?? current.details?.vehicleDetails ?? null,
          occupantCount: proposed.occupantCount ?? current.details?.occupantCount ?? null,
          notes: proposed.notes ?? current.details?.notes ?? null,
        };
        validationErrors = validateWorkflow(current.config, candidateRequest, candidateDetails, current.documents);
        const invalidProposals = validationErrors.filter((error) => Object.hasOwn(proposed, error.field));
        if (!invalidProposals.length) {
          await applyMoveRequestUpdate(current.request, proposed, transaction);
          appliedFields = proposed;
        }
      }
      if (!Object.keys(appliedFields).length) {
        output.requiresClarification = true;
        output.message = 'I could not apply those values. Please check the validation errors and clarify your request.';
      }
    }
    // The provider cannot introduce new mandatory fields or hide unsatisfied requirements.
    const actualErrors = Object.keys(appliedFields).length ? validationErrors : current.errors;
    const missingFields = [...new Set(actualErrors.map((error) => error.field))];
    const interactionId = randomUUID();
    const userTime = new Date();
    await AgentConversation.create({
      moveRequestId: id, role: AgentConversationRole.USER, message: input.message,
      metadata: { interactionId, residentId: current.request.residentId }, createdAt: userTime,
    }, { transaction });
    const agentMessage = await AgentConversation.create({
      moveRequestId: id, role: AgentConversationRole.AGENT, message: output.message,
      metadata: jsonObject({ interactionId, extractedFields: proposed, appliedFields, missingFields, requiresClarification: output.requiresClarification, validationErrors }),
      createdAt: new Date(Math.max(Date.now(), userTime.getTime() + 1)),
    }, { transaction });
    await AgentToolExecution.create({ moveRequestId: id, toolName: 'resident_chat_validated_update',
      input: { messageLength: input.message.length },
      output: { appliedFields: Object.keys(appliedFields), requiresClarification: output.requiresClarification, validationErrorCount: actualErrors.length },
      status: AgentToolExecutionStatus.SUCCESS, errorMessage: null }, { transaction });
    return { ...output, missingFields, appliedFields, validationErrors, conversationId: agentMessage.id };
  });
}

export async function generateAgentAssessment(id: string, adminId: string): Promise<AgentAssessment> {
  const identity = { adminId };
  const initial = await buildMoveRequestAgentContext(id, { identity });
  const provider = getAIProvider();
  const output = parseAgentAssessmentOutput(await providerCall(() => provider.generateAssessment({ context: initial.context })));
  return sequelize.transaction(async (transaction) => {
    const current = await buildMoveRequestAgentContext(id, { identity, transaction });
    assertUnchanged(initial.fingerprint, current.fingerprint);
    const deterministicIssues = [...current.errors, ...current.reviewWarnings];
    let { recommendation, confidence, reasoning } = output;
    if (recommendation === AgentAssessmentRecommendation.APPROVE && deterministicIssues.length) {
      recommendation = current.errors.length && !current.errors.some((error) => error.field === 'workflowConfig')
        ? AgentAssessmentRecommendation.REQUEST_CHANGES : AgentAssessmentRecommendation.MANUAL_REVIEW;
      confidence = null;
      reasoning = 'Deterministic checks found unmet requirements or unresolved review items. Resolve the listed issues before an admin decides.';
    }
    const assessment = await AgentAssessment.create({
      moveRequestId: id, recommendation, confidence, reasoning,
      issues: [
        ...deterministicIssues.map((issue) => ({ ...issue, source: 'deterministic' })),
        ...output.issues.map((issue) => ({ ...issue, source: 'agent' })),
      ],
    }, { transaction });
    await AgentToolExecution.create({ moveRequestId: id, toolName: 'generate_validated_assessment',
      input: { validationErrorCount: current.errors.length, reviewWarningCount: current.reviewWarnings.length },
      output: { assessmentId: assessment.id, recommendation, confidence }, status: AgentToolExecutionStatus.SUCCESS, errorMessage: null }, { transaction });
    return assessment;
  });
}

export async function getLatestAgentAssessment(id: string, adminId: string): Promise<AgentAssessment> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    await requireCommunityAdmin(adminId, request.communityId, transaction);
    const assessment = await AgentAssessment.findOne({ where: { moveRequestId: id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], transaction });
    if (!assessment) throw new ApiError(404, [{ field: 'assessment', message: 'No agent assessment exists for this request.' }]);
    return assessment;
  });
}
