import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';
import { addStatusHistoryAppendOnly } from './support/initial-constraints';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('status_histories', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
      fromStatus: { type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'), allowNull: true },
      toStatus: { type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'), allowNull: false },
      changedByType: { type: DataTypes.ENUM('RESIDENT', 'ADMIN', 'AGENT', 'SYSTEM'), allowNull: false },
      changedById: { type: DataTypes.UUID, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('status_histories', ['moveRequestId', 'createdAt'], {
      name: 'status_histories_request_created_idx', transaction,
    });
    await queryInterface.addIndex('status_histories', ['changedByType', 'changedById', 'createdAt'], {
      name: 'status_histories_actor_created_idx', transaction,
    });
    await queryInterface.addIndex('status_histories', ['toStatus', 'createdAt'], {
      name: 'status_histories_status_created_idx', transaction,
    });

    // A statement trigger also prevents bulk mutation and TRUNCATE.
    await addStatusHistoryAppendOnly(queryInterface, transaction);
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('status_histories', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_status_histories_fromStatus"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_status_histories_toStatus"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_status_histories_changedByType"', { transaction });
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS reject_status_histories_mutation()', { transaction });
  });
}
