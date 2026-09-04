import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { ActorType } from '../types/domain';
import type { JsonValue } from '../types/json';
import type { MoveRequest } from './move-request';

export interface AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']> | null;
  actorType: ActorType;
  // Polymorphic identity; there is no single referenced table.
  actorId: string | null;
  action: string;
  previousValue: JsonValue;
  newValue: JsonValue;
  metadata: JsonValue;
  createdAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest | null>;
}

// PostgreSQL migration triggers enforce append-only writes, including raw SQL.
export const AuditLog = sequelize.define<AuditLog>('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
  actorType: { type: DataTypes.ENUM(...Object.values(ActorType)), allowNull: false },
  actorId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING(255), allowNull: false },
  previousValue: { type: DataTypes.JSONB, allowNull: true },
  newValue: { type: DataTypes.JSONB, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { name: 'audit_logs_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'audit_logs_actor_created_idx', fields: ['actorType', 'actorId', 'createdAt'] },
    { name: 'audit_logs_created_idx', fields: ['createdAt'] },
  ],
});
