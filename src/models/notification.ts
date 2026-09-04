import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { NotificationRecipientType, NotificationChannel, NotificationStatus } from '../types/domain';
import type { MoveRequest } from './move-request';

export interface Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']> | null;
  recipientType: NotificationRecipientType;
  // Polymorphic identity; there is no single referenced table.
  recipientId: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  status: CreationOptional<NotificationStatus>;
  sentAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest | null>;
}

export const Notification = sequelize.define<Notification>('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  recipientType: { type: DataTypes.ENUM(...Object.values(NotificationRecipientType)), allowNull: false },
  recipientId: { type: DataTypes.UUID, allowNull: false },
  channel: { type: DataTypes.ENUM(...Object.values(NotificationChannel)), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(NotificationStatus)), allowNull: false, defaultValue: NotificationStatus.PENDING },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    { name: 'notifications_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'notifications_recipient_created_idx', fields: ['recipientType', 'recipientId', 'createdAt'] },
    { name: 'notifications_status_created_idx', fields: ['status', 'createdAt'] },
  ],
});
