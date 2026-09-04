import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { Community } from './community';
import type { Resident } from './resident';
import type { MoveRequest } from './move-request';

export interface Unit extends Model<InferAttributes<Unit>, InferCreationAttributes<Unit>> {
  id: CreationOptional<string>;
  communityId: ForeignKey<Community['id']>;
  unitNumber: string;
  tower: string;
  floor: number;
  isActive: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  community?: NonAttribute<Community>;
  residents?: NonAttribute<Resident[]>;
  moveRequests?: NonAttribute<MoveRequest[]>;
}

export const Unit = sequelize.define<Unit>('Unit', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  unitNumber: { type: DataTypes.STRING(50), allowNull: false },
  tower: { type: DataTypes.STRING(100), allowNull: false },
  floor: { type: DataTypes.INTEGER, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'units',
  timestamps: true,
  indexes: [
    { name: 'units_community_tower_number_unique', unique: true, fields: ['communityId', 'tower', 'unitNumber'] },
    { name: 'units_id_community_unique', unique: true, fields: ['id', 'communityId'] },
  ],
});
