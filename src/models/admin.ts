import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { AdminRole } from '../types/domain';
import type { Community } from './community';
import type { MoveRequest } from './move-request';
import type { Document } from './document';

export interface Admin extends Model<InferAttributes<Admin>, InferCreationAttributes<Admin>> {
  id: CreationOptional<string>;
  communityId: ForeignKey<Community['id']>;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  isActive: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  community?: NonAttribute<Community>;
  reviewedMoveRequests?: NonAttribute<MoveRequest[]>;
  verifiedDocuments?: NonAttribute<Document[]>;
}

export const Admin = sequelize.define<Admin>('Admin', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  phone: { type: DataTypes.STRING(32), allowNull: false },
  role: { type: DataTypes.ENUM(...Object.values(AdminRole)), allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'admins',
  timestamps: true,
  indexes: [
    { name: 'admins_community_email_idx', fields: ['communityId', 'email'] },
    { name: 'admins_id_community_unique', unique: true, fields: ['id', 'communityId'] },
  ],
});
