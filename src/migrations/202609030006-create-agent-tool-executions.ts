import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('agent_tool_executions', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      toolName: { type: DataTypes.STRING(255), allowNull: false },
      input: { type: DataTypes.JSONB, allowNull: true },
      output: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.ENUM('SUCCESS', 'FAILED'), allowNull: false },
      errorMessage: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('agent_tool_executions', ['moveRequestId', 'createdAt'], {
      name: 'agent_tool_executions_request_created_idx', transaction,
    });
    await queryInterface.addIndex('agent_tool_executions', ['status', 'createdAt'], {
      name: 'agent_tool_executions_status_created_idx', transaction,
    });
    await queryInterface.addIndex('agent_tool_executions', ['toolName', 'createdAt'], {
      name: 'agent_tool_executions_tool_created_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('agent_tool_executions', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_agent_tool_executions_status"', { transaction });
  });
}
