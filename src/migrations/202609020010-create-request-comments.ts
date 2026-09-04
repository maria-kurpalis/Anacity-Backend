import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('request_comments', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      authorType: { type: DataTypes.ENUM('RESIDENT', 'ADMIN', 'AGENT'), allowNull: false },
      authorId: { type: DataTypes.UUID, allowNull: true },
      comment: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('request_comments', ['moveRequestId', 'createdAt'], {
      name: 'request_comments_request_created_idx', transaction,
    });
    await queryInterface.addIndex('request_comments', ['authorType', 'authorId'], {
      name: 'request_comments_author_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('request_comments', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_request_comments_authorType"', { transaction });
  });
}
