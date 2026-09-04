import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { MoveRequestType, MoveRequestStatus } from '../types/domain';
import type { Community } from './community';
import type { Unit } from './unit';
import type { Resident } from './resident';
import type { Admin } from './admin';
import type { MoveRequestDetails } from './move-request-details';
import type { Document } from './document';
import type { RequestChecklist } from './request-checklist';
import type { RequestComment } from './request-comment';
import type { AgentConversation } from './agent-conversation';
import type { AgentAssessment } from './agent-assessment';
import type { AuditLog } from './audit-log';
import type { StatusHistory } from './status-history';
import type { Notification } from './notification';
import type { AgentToolExecution } from './agent-tool-execution';

export interface MoveRequest extends Model<InferAttributes<MoveRequest>, InferCreationAttributes<MoveRequest>> {
  id: CreationOptional<string>;
  residentId: ForeignKey<Resident['id']>;
  communityId: ForeignKey<Community['id']>;
  unitId: ForeignKey<Unit['id']>;
  type: MoveRequestType;
  status: CreationOptional<MoveRequestStatus>;
  requestedDate: string | null;
  requestedTimeSlot: string | null;
  submittedAt: Date | null;
  reviewedBy: ForeignKey<Admin['id']> | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  community?: NonAttribute<Community>;
  unit?: NonAttribute<Unit>;
  resident?: NonAttribute<Resident>;
  reviewer?: NonAttribute<Admin | null>;
  details?: NonAttribute<MoveRequestDetails | null>;
  documents?: NonAttribute<Document[]>;
  checklistItems?: NonAttribute<RequestChecklist[]>;
  comments?: NonAttribute<RequestComment[]>;
  agentConversations?: NonAttribute<AgentConversation[]>;
  agentAssessments?: NonAttribute<AgentAssessment[]>;
  auditLogs?: NonAttribute<AuditLog[]>;
  statusHistories?: NonAttribute<StatusHistory[]>;
  notifications?: NonAttribute<Notification[]>;
  agentToolExecutions?: NonAttribute<AgentToolExecution[]>;
}

export const MoveRequest = sequelize.define<MoveRequest>('MoveRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  residentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'residents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  unitId: { type: DataTypes.UUID, allowNull: false, references: { model: 'units', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  type: { type: DataTypes.ENUM(...Object.values(MoveRequestType)), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(MoveRequestStatus)), allowNull: false, defaultValue: MoveRequestStatus.DRAFT },
  requestedDate: { type: DataTypes.DATEONLY, allowNull: true },
  requestedTimeSlot: { type: DataTypes.STRING(100), allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'admins', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'move_requests',
  timestamps: true,
  indexes: [
    { name: 'move_requests_community_status_date_idx', fields: ['communityId', 'status', 'requestedDate'] },
    { name: 'move_requests_unit_community_idx', fields: ['unitId', 'communityId'] },
    { name: 'move_requests_resident_community_unit_idx', fields: ['residentId', 'communityId', 'unitId'] },
    { name: 'move_requests_reviewer_community_idx', fields: ['reviewedBy', 'communityId'] },
  ],
});
