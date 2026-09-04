import { Community } from './community';
import { Unit } from './unit';
import { Resident } from './resident';
import { Admin } from './admin';
import { MoveRequest } from './move-request';
import { MoveRequestDetails } from './move-request-details';
import { Document } from './document';
import { CommunityWorkflowConfig } from './community-workflow-config';
import { RequestChecklist } from './request-checklist';
import { RequestComment } from './request-comment';
import { AgentConversation } from './agent-conversation';
import { AgentAssessment } from './agent-assessment';
import { AuditLog } from './audit-log';
import { StatusHistory } from './status-history';
import { Notification } from './notification';
import { AgentToolExecution } from './agent-tool-execution';

// Initialize every model before wiring associations to avoid circular runtime imports.
Community.hasMany(Unit, { as: 'units', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Unit.belongsTo(Community, { as: 'community', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Community.hasMany(Resident, { as: 'residents', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Resident.belongsTo(Community, { as: 'community', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Community.hasMany(Admin, { as: 'admins', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Admin.belongsTo(Community, { as: 'community', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Community.hasMany(MoveRequest, { as: 'moveRequests', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
MoveRequest.belongsTo(Community, { as: 'community', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Unit.hasMany(Resident, { as: 'residents', foreignKey: { name: 'unitId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Resident.belongsTo(Unit, { as: 'unit', foreignKey: { name: 'unitId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Unit.hasMany(MoveRequest, { as: 'moveRequests', foreignKey: { name: 'unitId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
MoveRequest.belongsTo(Unit, { as: 'unit', foreignKey: { name: 'unitId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Resident.hasMany(MoveRequest, { as: 'moveRequests', foreignKey: { name: 'residentId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
MoveRequest.belongsTo(Resident, { as: 'resident', foreignKey: { name: 'residentId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Admin.hasMany(MoveRequest, { as: 'reviewedMoveRequests', foreignKey: { name: 'reviewedBy', allowNull: true }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
MoveRequest.belongsTo(Admin, { as: 'reviewer', foreignKey: { name: 'reviewedBy', allowNull: true }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });

MoveRequest.hasOne(MoveRequestDetails, { as: 'details', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
MoveRequestDetails.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(Document, { as: 'documents', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Document.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Admin.hasMany(Document, { as: 'verifiedDocuments', foreignKey: { name: 'verifiedBy', allowNull: true }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Document.belongsTo(Admin, { as: 'verifier', foreignKey: { name: 'verifiedBy', allowNull: true }, onDelete: 'SET NULL', onUpdate: 'CASCADE' });

Community.hasMany(CommunityWorkflowConfig, { as: 'workflowConfigs', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
CommunityWorkflowConfig.belongsTo(Community, { as: 'community', foreignKey: { name: 'communityId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(RequestChecklist, { as: 'checklistItems', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
RequestChecklist.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(RequestComment, { as: 'comments', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
RequestComment.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(AgentConversation, { as: 'agentConversations', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
AgentConversation.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(AgentAssessment, { as: 'agentAssessments', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
AgentAssessment.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(AuditLog, { as: 'auditLogs', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
AuditLog.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });

MoveRequest.hasMany(StatusHistory, { as: 'statusHistories', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
StatusHistory.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: false }, onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });

MoveRequest.hasMany(Notification, { as: 'notifications', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Notification.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

MoveRequest.hasMany(AgentToolExecution, { as: 'agentToolExecutions', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
AgentToolExecution.belongsTo(MoveRequest, { as: 'moveRequest', foreignKey: { name: 'moveRequestId', allowNull: true }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

export {
  Community, Unit, Resident, Admin, MoveRequest,
  MoveRequestDetails, Document, CommunityWorkflowConfig, RequestChecklist, RequestComment,
  AgentConversation, AgentAssessment, AuditLog,
  StatusHistory, Notification, AgentToolExecution,
};
export {
  ResidentType, AdminRole, MoveRequestType, MoveRequestStatus,
  DocumentStatus, ChecklistStatus, ChecklistCompletedByType, CommentAuthorType,
  AgentConversationRole, AgentAssessmentRecommendation, ActorType,
  NotificationRecipientType, NotificationChannel, NotificationStatus, AgentToolExecutionStatus,
} from '../types/domain';
