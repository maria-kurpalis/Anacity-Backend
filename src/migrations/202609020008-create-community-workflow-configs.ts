import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('community_workflow_configs', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      requestType: { type: DataTypes.ENUM('MOVE_IN', 'MOVE_OUT'), allowNull: false },
      requiredFields: { type: DataTypes.JSONB, allowNull: false },
      requiredDocuments: { type: DataTypes.JSONB, allowNull: false },
      allowedDays: { type: DataTypes.JSONB, allowNull: false },
      allowedTimeSlots: { type: DataTypes.JSONB, allowNull: false },
      instructions: { type: DataTypes.TEXT, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('community_workflow_configs', ['communityId', 'requestType'], {
      name: 'community_workflow_configs_community_type_unique', unique: true, transaction,
    });
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('community_workflow_configs', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_community_workflow_configs_requestType"', { transaction });
  });
}
