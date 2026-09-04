import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { MoveRequestStatus, ActorType } from '../types/domain';
import type { MoveRequest } from './move-request';

export interface StatusHistory extends Model<InferAttributes<StatusHistory>, InferCreationAttributes<StatusHistory>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  fromStatus: MoveRequestStatus | null;
  toStatus: MoveRequestStatus;
  changedByType: ActorType;
  // Polymorphic identity; there is no single referenced table.
  changedById: string | null;
  reason: string | null;
  createdAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

// PostgreSQL migration triggers enforce append-only writes, including raw SQL.
export const StatusHistory = sequelize.define<StatusHistory>('StatusHistory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
  fromStatus: { type: DataTypes.ENUM(...Object.values(MoveRequestStatus)), allowNull: true },
  toStatus: { type: DataTypes.ENUM(...Object.values(MoveRequestStatus)), allowNull: false },
  changedByType: { type: DataTypes.ENUM(...Object.values(ActorType)), allowNull: false },
  changedById: { type: DataTypes.UUID, allowNull: true },
  reason: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'status_histories',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { name: 'status_histories_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'status_histories_actor_created_idx', fields: ['changedByType', 'changedById', 'createdAt'] },
    { name: 'status_histories_status_created_idx', fields: ['toStatus', 'createdAt'] },
  ],
});
