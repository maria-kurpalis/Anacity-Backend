import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('notifications', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: true, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      recipientType: { type: DataTypes.ENUM('RESIDENT', 'ADMIN'), allowNull: false },
      recipientId: { type: DataTypes.UUID, allowNull: false },
      channel: { type: DataTypes.ENUM('IN_APP', 'EMAIL'), allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'), allowNull: false, defaultValue: 'PENDING' },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('notifications', ['moveRequestId', 'createdAt'], {
      name: 'notifications_request_created_idx', transaction,
    });
    await queryInterface.addIndex('notifications', ['recipientType', 'recipientId', 'createdAt'], {
      name: 'notifications_recipient_created_idx', transaction,
    });
    await queryInterface.addIndex('notifications', ['status', 'createdAt'], {
      name: 'notifications_status_created_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('notifications', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_recipientType"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_channel"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_status"', { transaction });
  });
}
