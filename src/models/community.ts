import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { Unit } from './unit';
import type { Resident } from './resident';
import type { Admin } from './admin';
import type { MoveRequest } from './move-request';
import type { CommunityWorkflowConfig } from './community-workflow-config';

export interface Community extends Model<InferAttributes<Community>, InferCreationAttributes<Community>> {
  id: CreationOptional<string>;
  name: string;
  code: string;
  address: string;
  isActive: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  units?: NonAttribute<Unit[]>;
  residents?: NonAttribute<Resident[]>;
  admins?: NonAttribute<Admin[]>;
  moveRequests?: NonAttribute<MoveRequest[]>;
  workflowConfigs?: NonAttribute<CommunityWorkflowConfig[]>;
}

export const Community = sequelize.define<Community>('Community', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'communities',
  timestamps: true,
  indexes: [
    { name: 'communities_code_unique', unique: true, fields: ['code'] },
  ],
});
