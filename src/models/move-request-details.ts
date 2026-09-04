import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import type { JsonData } from '../types/json';
import type { MoveRequest } from './move-request';

export interface MoveRequestDetails extends Model<InferAttributes<MoveRequestDetails>, InferCreationAttributes<MoveRequestDetails>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  movingCompany: string | null;
  vehicleCount: number | null;
  vehicleDetails: JsonData | null;
  occupantCount: number | null;
  notes: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

export const MoveRequestDetails = sequelize.define<MoveRequestDetails>('MoveRequestDetails', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  movingCompany: { type: DataTypes.STRING(255), allowNull: true },
  vehicleCount: { type: DataTypes.INTEGER, allowNull: true, validate: { isInt: true, min: 0 } },
  vehicleDetails: { type: DataTypes.JSONB, allowNull: true },
  occupantCount: { type: DataTypes.INTEGER, allowNull: true, validate: { isInt: true, min: 0 } },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'move_request_details',
  timestamps: true,
  indexes: [
    { name: 'move_request_details_request_unique', unique: true, fields: ['moveRequestId'] },
  ],
});
