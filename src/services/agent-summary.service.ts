import { buildMoveRequestAgentContext, jsonObject } from './agent-context.service';
import type { AgentContextOptions } from './agent-context.service';
import type { JsonObject } from '../types/json';
import { parseWorkflowRules } from '../validation/workflow-config';

// Deterministic projection of the shared context; no additional AI call is needed.
export async function buildMoveRequestAgentSummary(id: string, options: AgentContextOptions = {}): Promise<JsonObject> {
  const snapshot = await buildMoveRequestAgentContext(id, options);
  const rules = snapshot.config && !snapshot.errors.some((error) => error.field === 'workflowConfig') ? parseWorkflowRules(snapshot.config) : null;
  const requiredDocuments = rules ? [...new Set(rules.requiredDocuments)].map((documentType) => {
    const documents = snapshot.documents.filter((document) => document.documentType === documentType && document.fileUrl.trim());
    const status = documents.some((document) => document.status === 'VERIFIED') ? 'VERIFIED'
      : documents.some((document) => document.status === 'PENDING') ? 'PENDING'
        : documents.some((document) => document.status === 'REJECTED') ? 'REJECTED' : 'MISSING';
    return { documentType, status };
  }) : null;
  return jsonObject({
    moveRequestId: snapshot.request.id, type: snapshot.request.type, status: snapshot.request.status,
    community: snapshot.context.community, unit: snapshot.context.unit,
    resident: snapshot.context.resident, requiredDocuments,
    documentCounts: { required: requiredDocuments?.length ?? null, uploaded: snapshot.documents.filter((document) => document.fileUrl.trim()).length,
      verified: snapshot.documents.filter((document) => document.status === 'VERIFIED').length,
      rejected: snapshot.documents.filter((document) => document.status === 'REJECTED').length },
    checklistCounts: { completed: snapshot.checklist.filter((item) => item.status === 'COMPLETED').length,
      pending: snapshot.checklist.filter((item) => item.status === 'PENDING').length,
      notApplicable: snapshot.checklist.filter((item) => item.status === 'NOT_APPLICABLE').length },
    requestedDate: snapshot.request.requestedDate, requestedTimeSlot: snapshot.request.requestedTimeSlot,
    documentCount: snapshot.documents.length, checklistItemCount: snapshot.checklist.length,
    recentMessages: snapshot.context.recentMessages, latestAssessment: snapshot.context.latestAssessment,
    validation: snapshot.context.deterministicValidation,
  });
}
