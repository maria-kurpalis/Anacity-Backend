import { DataTypes, literal } from 'sequelize';
import type { QueryInterface } from 'sequelize';
import { addMoveRequestMembershipConstraints } from './support/initial-constraints';

// Keep historical migrations independent of application models and enums.
export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.createTable('move_requests', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: literal('gen_random_uuid()') },
      residentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'residents', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      communityId: { type: DataTypes.UUID, allowNull: false, references: { model: 'communities', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      unitId: { type: DataTypes.UUID, allowNull: false, references: { model: 'units', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      type: { type: DataTypes.ENUM('MOVE_IN', 'MOVE_OUT'), allowNull: false },
      status: { type: DataTypes.ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'), allowNull: false, defaultValue: 'DRAFT' },
      requestedDate: { type: DataTypes.DATEONLY, allowNull: false },
      requestedTimeSlot: { type: DataTypes.STRING(100), allowNull: false },
      submittedAt: { type: DataTypes.DATE, allowNull: true },
      reviewedBy: { type: DataTypes.UUID, allowNull: true, references: { model: 'admins', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
    }, { transaction });

    await queryInterface.addIndex('move_requests', ['communityId', 'status', 'requestedDate'], {
      name: 'move_requests_community_status_date_idx', transaction,
    });
    await queryInterface.addIndex('move_requests', ['unitId', 'communityId'], {
      name: 'move_requests_unit_community_idx', transaction,
    });
    await queryInterface.addIndex('move_requests', ['residentId', 'communityId', 'unitId'], {
      name: 'move_requests_resident_community_unit_idx', transaction,
    });
    await queryInterface.addIndex('move_requests', ['reviewedBy', 'communityId'], {
      name: 'move_requests_reviewer_community_idx', transaction,
    });

    // Composite foreign keys prevent references across communities or mismatched units.
    await addMoveRequestMembershipConstraints(queryInterface, transaction);
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.dropTable('move_requests', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_move_requests_type"', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_move_requests_status"', { transaction });
  });
}
