import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('request_checklists', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      key: { type: DataTypes.STRING(100), allowNull: false },
      label: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.ENUM('PENDING', 'COMPLETED', 'NOT_APPLICABLE'), allowNull: false, defaultValue: 'PENDING' },
      completedByType: { type: DataTypes.ENUM('RESIDENT', 'ADMIN', 'AGENT', 'SYSTEM'), allowNull: true },
      completedById: { type: DataTypes.UUID, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('request_checklists', ['moveRequestId', 'key'], {
      name: 'request_checklists_request_key_unique', unique: true, transaction,
    });
    await queryInterface.addIndex('request_checklists', ['moveRequestId', 'status'], {
      name: 'request_checklists_request_status_idx', transaction,
    });
    await queryInterface.addIndex('request_checklists', ['completedByType', 'completedById'], {
      name: 'request_checklists_completed_by_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('request_checklists', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_request_checklists_status"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_request_checklists_completedByType"', { transaction });
  });
}
