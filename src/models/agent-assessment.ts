import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { AgentAssessmentRecommendation } from '../types/domain';
import type { JsonValue } from '../types/json';
import type { MoveRequest } from './move-request';

export interface AgentAssessment extends Model<InferAttributes<AgentAssessment>, InferCreationAttributes<AgentAssessment>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  recommendation: AgentAssessmentRecommendation;
  confidence: number | null;
  reasoning: string;
  issues: JsonValue;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

export const AgentAssessment = sequelize.define<AgentAssessment>('AgentAssessment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  recommendation: { type: DataTypes.ENUM(...Object.values(AgentAssessmentRecommendation)), allowNull: false },
  confidence: { type: DataTypes.FLOAT, allowNull: true },
  reasoning: { type: DataTypes.TEXT, allowNull: false },
  issues: { type: DataTypes.JSONB, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'agent_assessments',
  timestamps: true,
  indexes: [
    { name: 'agent_assessments_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'agent_assessments_recommendation_created_idx', fields: ['recommendation', 'createdAt'] },
  ],
});
