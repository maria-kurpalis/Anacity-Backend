import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { ChecklistStatus, ChecklistCompletedByType } from '../types/domain';
import type { MoveRequest } from './move-request';

export interface RequestChecklist extends Model<InferAttributes<RequestChecklist>, InferCreationAttributes<RequestChecklist>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  key: string;
  label: string;
  status: CreationOptional<ChecklistStatus>;
  completedByType: ChecklistCompletedByType | null;
  // Polymorphic actor ID; there is no single referenced table.
  completedById: string | null;
  completedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

export const RequestChecklist = sequelize.define<RequestChecklist>('RequestChecklist', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  key: { type: DataTypes.STRING(100), allowNull: false },
  label: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(ChecklistStatus)), allowNull: false, defaultValue: ChecklistStatus.PENDING },
  completedByType: { type: DataTypes.ENUM(...Object.values(ChecklistCompletedByType)), allowNull: true },
  completedById: { type: DataTypes.UUID, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'request_checklists',
  timestamps: true,
  indexes: [
    { name: 'request_checklists_request_key_unique', unique: true, fields: ['moveRequestId', 'key'] },
    { name: 'request_checklists_request_status_idx', fields: ['moveRequestId', 'status'] },
    { name: 'request_checklists_completed_by_idx', fields: ['completedByType', 'completedById'] },
  ],
});
