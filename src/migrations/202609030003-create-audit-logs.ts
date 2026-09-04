import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';
import { addAuditLogAppendOnly } from './support/initial-constraints';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('audit_logs', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
      actorType: { type: DataTypes.ENUM('RESIDENT', 'ADMIN', 'AGENT', 'SYSTEM'), allowNull: false },
      actorId: { type: DataTypes.UUID, allowNull: true },
      action: { type: DataTypes.STRING(255), allowNull: false },
      previousValue: { type: DataTypes.JSONB, allowNull: true },
      newValue: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('audit_logs', ['moveRequestId', 'createdAt'], {
      name: 'audit_logs_request_created_idx', transaction,
    });
    await queryInterface.addIndex('audit_logs', ['actorType', 'actorId', 'createdAt'], {
      name: 'audit_logs_actor_created_idx', transaction,
    });
    await queryInterface.addIndex('audit_logs', ['createdAt'], {
      name: 'audit_logs_created_idx', transaction,
    });

    // A statement trigger also prevents bulk mutation and TRUNCATE.
    await addAuditLogAppendOnly(queryInterface, transaction);
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('audit_logs', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_audit_logs_actorType"', { transaction });
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS reject_audit_logs_mutation()', { transaction });
  });
}
