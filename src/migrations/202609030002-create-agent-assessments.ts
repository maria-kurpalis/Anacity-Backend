import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('agent_assessments', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      recommendation: { type: DataTypes.ENUM('APPROVE', 'REJECT', 'REQUEST_CHANGES', 'MANUAL_REVIEW'), allowNull: false },
      confidence: { type: DataTypes.FLOAT, allowNull: true },
      reasoning: { type: DataTypes.TEXT, allowNull: false },
      issues: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('agent_assessments', ['moveRequestId', 'createdAt'], {
      name: 'agent_assessments_request_created_idx', transaction,
    });
    await queryInterface.addIndex('agent_assessments', ['recommendation', 'createdAt'], {
      name: 'agent_assessments_recommendation_created_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('agent_assessments', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_agent_assessments_recommendation"', { transaction });
  });
}
