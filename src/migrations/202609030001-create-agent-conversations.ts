import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('agent_conversations', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      role: { type: DataTypes.ENUM('USER', 'AGENT', 'ADMIN', 'SYSTEM'), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('agent_conversations', ['moveRequestId', 'createdAt'], {
      name: 'agent_conversations_request_created_idx', transaction,
    });
    await queryInterface.addIndex('agent_conversations', ['role', 'createdAt'], {
      name: 'agent_conversations_role_created_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('agent_conversations', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_agent_conversations_role"', { transaction });
  });
}
