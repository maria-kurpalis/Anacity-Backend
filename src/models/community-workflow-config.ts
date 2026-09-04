import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { MoveRequestType } from '../types/domain';
import type { JsonData } from '../types/json';
import type { Community } from './community';

export interface CommunityWorkflowConfig extends Model<InferAttributes<CommunityWorkflowConfig>, InferCreationAttributes<CommunityWorkflowConfig>> {
  id: CreationOptional<string>;
  communityId: ForeignKey<Community['id']>;
  requestType: MoveRequestType;
  requiredFields: JsonData;
  requiredDocuments: JsonData;
  allowedDays: JsonData;
  allowedTimeSlots: JsonData;
  instructions: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  community?: NonAttribute<Community>;
}

export const CommunityWorkflowConfig = sequelize.define<CommunityWorkflowConfig>('CommunityWorkflowConfig', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  requestType: { type: DataTypes.ENUM(...Object.values(MoveRequestType)), allowNull: false },
  requiredFields: { type: DataTypes.JSONB, allowNull: false },
  requiredDocuments: { type: DataTypes.JSONB, allowNull: false },
  allowedDays: { type: DataTypes.JSONB, allowNull: false },
  allowedTimeSlots: { type: DataTypes.JSONB, allowNull: false },
  instructions: { type: DataTypes.TEXT, allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'community_workflow_configs',
  timestamps: true,
  indexes: [
    { name: 'community_workflow_configs_community_type_unique', unique: true, fields: ['communityId', 'requestType'] },
  ],
});
