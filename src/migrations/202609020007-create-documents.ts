import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('documents', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      documentType: { type: DataTypes.STRING(100), allowNull: false },
      fileUrl: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('PENDING', 'VERIFIED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
      uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      verifiedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'admins', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('documents', ['moveRequestId', 'status'], {
      name: 'documents_request_status_idx', transaction,
    });
    await queryInterface.addIndex('documents', ['verifiedBy'], {
      name: 'documents_verified_by_idx', transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('documents', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_documents_status"', { transaction });
  });
}
