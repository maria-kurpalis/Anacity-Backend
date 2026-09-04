import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { DocumentStatus } from '../types/domain';
import type { MoveRequest } from './move-request';
import type { Admin } from './admin';

export interface Document extends Model<InferAttributes<Document>, InferCreationAttributes<Document>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  documentType: string;
  fileUrl: string;
  status: CreationOptional<DocumentStatus>;
  uploadedAt: CreationOptional<Date>;
  verifiedBy: ForeignKey<Admin['id']> | null;
  verifiedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
  verifier?: NonAttribute<Admin | null>;
}

export const Document = sequelize.define<Document>('Document', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  documentType: { type: DataTypes.STRING(100), allowNull: false },
  fileUrl: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(DocumentStatus)), allowNull: false, defaultValue: DocumentStatus.PENDING },
  uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  verifiedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'admins', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
  verifiedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'documents',
  timestamps: true,
  indexes: [
    { name: 'documents_request_status_idx', fields: ['moveRequestId', 'status'] },
    { name: 'documents_verified_by_idx', fields: ['verifiedBy'] },
  ],
});
