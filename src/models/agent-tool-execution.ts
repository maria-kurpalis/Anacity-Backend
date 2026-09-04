import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { AgentToolExecutionStatus } from '../types/domain';
import type { JsonValue } from '../types/json';
import type { MoveRequest } from './move-request';

export interface AgentToolExecution extends Model<InferAttributes<AgentToolExecution>, InferCreationAttributes<AgentToolExecution>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']> | null;
  toolName: string;
  input: JsonValue;
  output: JsonValue;
  status: AgentToolExecutionStatus;
  errorMessage: string | null;
  createdAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest | null>;
}

export const AgentToolExecution = sequelize.define<AgentToolExecution>('AgentToolExecution', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  toolName: { type: DataTypes.STRING(255), allowNull: false },
  input: { type: DataTypes.JSONB, allowNull: true },
  output: { type: DataTypes.JSONB, allowNull: true },
  status: { type: DataTypes.ENUM(...Object.values(AgentToolExecutionStatus)), allowNull: false },
  errorMessage: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'agent_tool_executions',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { name: 'agent_tool_executions_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'agent_tool_executions_status_created_idx', fields: ['status', 'createdAt'] },
    { name: 'agent_tool_executions_tool_created_idx', fields: ['toolName', 'createdAt'] },
  ],
});
