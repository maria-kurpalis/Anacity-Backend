import { sequelize } from '../config/database';
import { CommunityWorkflowConfig, Document, MoveRequestDetails, RequestChecklist } from '../models';
import { ApiError, type FieldError } from '../types/api';
import { lockMoveRequest } from './move-request-access.service';
import { canMoveRequestTransition, isMoveRequestEditable } from './move-request-state.service';
import { MoveRequestStatus } from '../types/domain';
import { validateWorkflow } from './workflow-validation.service';
import { parseWorkflowRules } from '../validation/workflow-config';

// Progress uses exactly the submission rules. Checklist review is informational,
// because pending checklist items are not a submission gate in the workflow.
export async function getMoveRequestProgress(id: string) {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const config = await CommunityWorkflowConfig.findOne({
      where: { communityId: request.communityId, requestType: request.type },
      transaction, lock: transaction.LOCK.SHARE,
    });
    const details = await MoveRequestDetails.findOne({ where: { moveRequestId: id }, transaction });
    const documents = await Document.findAll({ where: { moveRequestId: id }, transaction });
    const checklist = await RequestChecklist.findAll({
      where: { moveRequestId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']], transaction,
    });
    let errors: FieldError[] = [{ field: 'workflowConfig', message: 'Community requirements are unavailable. Contact your community admin before submitting.' }];
    let rules: ReturnType<typeof parseWorkflowRules> | null = null;
    if (config) {
      try {
        errors = validateWorkflow(config, request, details, documents);
        rules = parseWorkflowRules({
          requiredFields: config.requiredFields, requiredDocuments: config.requiredDocuments,
          allowedDays: config.allowedDays, allowedTimeSlots: config.allowedTimeSlots,
        });
      } catch (error) {
        // An invalid configuration blocks submission, but must not hide the
        // resident's existing request or prevent manual draft editing.
        if (!(error instanceof ApiError)) throw error;
      }
    }
    const fields = (rules?.requiredFields ?? []).map((field) => ({
      key: field, completed: !errors.some((error) => error.field === field),
    }));
    const documentItems = (rules?.requiredDocuments ?? []).map((documentType) => ({
      key: documentType, completed: !errors.some((error) => error.field === `documents.${documentType}`),
    }));
    return {
      moveRequestId: id, type: request.type, status: request.status,
      canCancel: canMoveRequestTransition(request.status, MoveRequestStatus.CANCELLED),
      requestedDate: request.requestedDate, requestedTimeSlot: request.requestedTimeSlot,
      workflowConfig: rules && config ? { ...rules, instructions: config.instructions } : null,
      sections: {
        moveDetails: { completed: Boolean(config) && !errors.some((error) => !error.field.startsWith('documents.')), items: fields },
        documents: { completed: Boolean(rules) && documentItems.every((item) => item.completed), items: documentItems },
        checklist: { completed: checklist.every((item) => item.status !== 'PENDING'), items: checklist.map((item) => ({
          id: item.id, key: item.key, label: item.label, status: item.status,
        })) },
      },
      missingFields: errors.filter((error) => !error.field.startsWith('documents.')).map((error) => error.field),
      missingDocuments: errors.filter((error) => error.field.startsWith('documents.')).map((error) => error.field.slice('documents.'.length)),
      errors, readyToSubmit: isMoveRequestEditable(request.status) && errors.length === 0,
    };
  });
}
