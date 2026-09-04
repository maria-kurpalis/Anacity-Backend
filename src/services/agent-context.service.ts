import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import {
  MoveRequestDetails, CommunityWorkflowConfig, Document, RequestChecklist, AgentConversation, StatusHistory,
  Resident, Unit, Community, AgentAssessment, MoveRequestStatus, DocumentStatus, ChecklistStatus,
} from '../models';
import type { MoveRequest } from '../models';
import { ApiError } from '../types/api';
import type { FieldError } from '../types/api';
import type { JsonObject } from '../types/json';
import { lockMoveRequest, requireRequestParticipant } from './move-request-access.service';
import { validateWorkflow } from './workflow-validation.service';
import { canMoveRequestTransition } from './move-request-state.service';
import { getRecentAgentConversations } from './agent-conversation.service';
import type { AgentIdentity } from '../types/agent';

export function jsonObject(value: object): JsonObject { return JSON.parse(JSON.stringify(value)) as JsonObject; }

export interface AgentContextOptions {
  identity?: AgentIdentity;
  transaction?: Transaction;
}

export interface MoveRequestAgentContext {
  request: MoveRequest;
  details: MoveRequestDetails | null;
  resident: Resident | null;
  unit: Unit | null;
  community: Community | null;
  documents: Document[];
  checklist: RequestChecklist[];
  config: CommunityWorkflowConfig | null;
  conversations: AgentConversation[];
  latestAssessment: AgentAssessment | null;
  errors: FieldError[];
  reviewWarnings: FieldError[];
  context: JsonObject;
  fingerprint: string;
}

// Internal callers may use the one-argument form; every HTTP caller supplies an identity.
// The optional transaction lets chat updates and assessments reuse a locked, authorized snapshot.
export async function buildMoveRequestAgentContext(id: string, options: AgentContextOptions = {}): Promise<MoveRequestAgentContext> {
  if (!options.transaction) {
    return sequelize.transaction((transaction) => buildMoveRequestAgentContext(id, { ...options, transaction }));
  }
  const transaction = options.transaction;
  const request = await lockMoveRequest(id, transaction);
  if (options.identity) await requireRequestParticipant(options.identity, request, transaction);
  const details = await MoveRequestDetails.findOne({ where: { moveRequestId: id }, transaction });
  const documents = await Document.findAll({ where: { moveRequestId: id }, order: [['id', 'ASC']], transaction });
  const checklist = await RequestChecklist.findAll({ where: { moveRequestId: id }, order: [['id', 'ASC']], transaction });
  const config = await CommunityWorkflowConfig.findOne({
    where: { communityId: request.communityId, requestType: request.type }, transaction, lock: transaction.LOCK.SHARE,
  });
  const resident = await Resident.findByPk(request.residentId, { attributes: ['id', 'communityId', 'unitId', 'name', 'residentType'], transaction });
  const unit = await Unit.findByPk(request.unitId, { attributes: ['id', 'unitNumber', 'tower', 'floor'], transaction });
  const community = await Community.findByPk(request.communityId, { attributes: ['id', 'name', 'code', 'address', 'isActive'], transaction });
  const histories = await StatusHistory.findAll({ where: { moveRequestId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], transaction });
  const conversations = await getRecentAgentConversations(id, transaction);
  const latestAssessment = await AgentAssessment.findOne({
    where: { moveRequestId: id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], transaction,
  });
  let errors: FieldError[];
  if (!config) errors = [{ field: 'workflowConfig', message: 'No workflow configuration is available for this community and move type.' }];
  else {
    try { errors = validateWorkflow(config, request, details, documents); }
    catch (error) {
      if (!(error instanceof ApiError)) throw error;
      errors = [{ field: 'workflowConfig', message: 'The stored community workflow configuration is invalid and needs admin attention.' }];
    }
  }
  const reviewWarnings: FieldError[] = [];
  if (!canMoveRequestTransition(request.status, MoveRequestStatus.APPROVED)) {
    reviewWarnings.push({ field: 'status', message: 'The request must be UNDER_REVIEW before an admin can approve it.' });
  }
  for (const item of checklist) if (item.status === ChecklistStatus.PENDING) {
    reviewWarnings.push({ field: `checklist.${item.key}`, message: `Checklist item "${item.label}" is still pending review.` });
  }
  const requiredDocumentTypes = new Set(
    Array.isArray(config?.requiredDocuments)
      ? config.requiredDocuments.filter((value): value is string => typeof value === 'string')
      : [],
  );
  for (const document of documents) if (requiredDocumentTypes.has(document.documentType) && document.status === DocumentStatus.PENDING) {
    reviewWarnings.push({ field: `documents.${document.id}`, message: `${document.documentType} has not yet been verified by an admin.` });
  }
  for (const document of documents) if (requiredDocumentTypes.has(document.documentType) && document.status === DocumentStatus.REJECTED) {
    reviewWarnings.push({ field: `documents.${document.id}`, message: `${document.documentType} was rejected and needs attention.` });
  }
  const context = jsonObject({
    moveRequest: request,
    details: details ? { vehicleCount: details.vehicleCount, vehicleDetails: details.vehicleDetails,
      occupantCount: details.occupantCount, notes: details.notes } : null,
    resident, unit, community, checklist, workflowConfig: config,
    documents: documents.map((document) => ({
      id: document.id, documentType: document.documentType, status: document.status,
      hasFile: Boolean(document.fileUrl.trim()), uploadedAt: document.uploadedAt,
      verifiedBy: document.verifiedBy, verifiedAt: document.verifiedAt,
    })),
    statusHistory: histories,
    recentMessages: conversations.map(({ role, message }) => ({ role, message })),
    latestAssessment,
    deterministicValidation: { errors, reviewWarnings },
  });
  // Include complete records in the version check; omit dedicated file-URL/contact fields from the provider context.
  const fingerprint = createHash('sha256').update(JSON.stringify({ context, documents, details, config, conversations })).digest('hex');
  return { request, details, resident, unit, community, documents, checklist, config, conversations, latestAssessment, errors, reviewWarnings, context, fingerprint };
}
