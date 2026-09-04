import { DataTypes } from 'sequelize';
import type { Model, CreationOptional, ForeignKey, InferAttributes, InferCreationAttributes, NonAttribute } from 'sequelize';
import { sequelize } from '../config/database';
import { CommentAuthorType } from '../types/domain';
import type { MoveRequest } from './move-request';

export interface RequestComment extends Model<InferAttributes<RequestComment>, InferCreationAttributes<RequestComment>> {
  id: CreationOptional<string>;
  moveRequestId: ForeignKey<MoveRequest['id']>;
  authorType: CommentAuthorType;
  // Polymorphic actor ID; there is no single referenced table.
  authorId: string | null;
  comment: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  moveRequest?: NonAttribute<MoveRequest>;
}

export const RequestComment = sequelize.define<RequestComment>('RequestComment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
  moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
  authorType: { type: DataTypes.ENUM(...Object.values(CommentAuthorType)), allowNull: false },
  authorId: { type: DataTypes.UUID, allowNull: true },
  comment: { type: DataTypes.TEXT, allowNull: false },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'request_comments',
  timestamps: true,
  indexes: [
    { name: 'request_comments_request_created_idx', fields: ['moveRequestId', 'createdAt'] },
    { name: 'request_comments_author_idx', fields: ['authorType', 'authorId'] },
  ],
});
