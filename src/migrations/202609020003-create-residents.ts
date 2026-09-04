import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';
import { addResidentMembershipConstraint } from './support/initial-constraints';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('residents', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      unitId: { type: DataTypes.UUID, allowNull: false, references: { model: 'units', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: false },
      phone: { type: DataTypes.STRING(32), allowNull: false },
      residentType: { type: DataTypes.ENUM('OWNER', 'TENANT'), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('residents', ['communityId', 'email'], {
      name: 'residents_community_email_idx', transaction,
    });
    await queryInterface.addIndex('residents', ['unitId', 'communityId'], {
      name: 'residents_unit_community_idx', transaction,
    });
    await queryInterface.addIndex('residents', ['id', 'communityId', 'unitId'], {
      name: 'residents_id_community_unit_unique', unique: true, transaction,
    });

    // Composite foreign keys prevent references across communities or mismatched units.
    await addResidentMembershipConstraint(queryInterface, transaction);
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('residents', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_residents_residentType"', { transaction });
  });
}
