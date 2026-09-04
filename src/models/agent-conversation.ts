import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { AgentConversationRole } from '../types/domain';
import type { JsonValue } from '../types/json';
import type { MoveRequest } from './move-request';

export interface AgentConversation extends Model<InferAttributes<AgentConversation>, InferCreationAttributes<AgentConversation>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  role: AgentConversationRole;
  message: string;
  metadata: JsonValue;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

export const AgentConversation = sequelize.define<AgentConversation>('AgentConversation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  role: { type: DataTypes.ENUM(...Object.values(AgentConversationRole)), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'agent_conversations',
  timestamps: true,
  indexes: [
    { name: 'agent_conversations_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'agent_conversations_role_created_idx', fields: ['role', 'createdAt'] },
  ],
});
