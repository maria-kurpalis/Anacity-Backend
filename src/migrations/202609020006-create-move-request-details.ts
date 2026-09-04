import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';
import { addRequestDetailsCountChecks } from './support/initial-constraints';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('move_request_details', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      moveRequestId: { type: DataTypes.UUID, allowNull: false, references: { model: 'move_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      movingCompany: { type: DataTypes.STRING(255), allowNull: false },
      vehicleCount: { type: DataTypes.INTEGER, allowNull: false },
      vehicleDetails: { type: DataTypes.JSONB, allowNull: false },
      occupantCount: { type: DataTypes.INTEGER, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('move_request_details', ['moveRequestId'], {
      name: 'move_request_details_request_unique', unique: true, transaction,
    });

    await addRequestDetailsCountChecks(queryInterface, transaction);
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('move_request_details', { transaction });
  });
}
