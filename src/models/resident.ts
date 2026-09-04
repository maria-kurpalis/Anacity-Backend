import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { ResidentType } from '../types/domain';
import type { Community } from './community';
import type { Unit } from './unit';
import type { MoveRequest } from './move-request';

export interface Resident extends Model<InferAttributes<Resident>, InferCreationAttributes<Resident>> {
  id: CreationOptional<string>;
  communityId: ForeignKey<Community['id']>;
  unitId: ForeignKey<Unit['id']>;
  name: string;
  email: string;
  phone: string;
  residentType: ResidentType;
  isActive: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  community?: NonAttribute<Community>;
  unit?: NonAttribute<Unit>;
  moveRequests?: NonAttribute<MoveRequest[]>;
}

export const Resident = sequelize.define<Resident>('Resident', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  unitId: { type: DataTypes.UUID, allowNull: false, references: { model: 'units', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  phone: { type: DataTypes.STRING(32), allowNull: false },
  residentType: { type: DataTypes.ENUM(...Object.values(ResidentType)), allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'residents',
  timestamps: true,
  indexes: [
    { name: 'residents_community_email_idx', fields: ['communityId', 'email'] },
    { name: 'residents_unit_community_idx', fields: ['unitId', 'communityId'] },
    { name: 'residents_id_community_unit_unique', unique: true, fields: ['id', 'communityId', 'unitId'] },
  ],
});
