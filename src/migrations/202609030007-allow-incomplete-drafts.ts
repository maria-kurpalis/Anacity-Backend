import type { QueryInterface } from 'sequelize';

// A draft may not have a schedule or complete details yet. Submission validates
// completeness against the community workflow rather than inventing placeholder data.
const fields = {
  move_requests: ['requestedDate', 'requestedTimeSlot'],
  move_request_details: ['movingCompany', 'vehicleCount', 'vehicleDetails', 'occupantCount', 'notes'],
};

export async function up({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    for (const [table, columns] of Object.entries(fields)) {
      for (const column of columns) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL`,
          { transaction },
        );
      }
    }
  });
}

export async function down({ context: queryInterface }: { context: QueryInterface }): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    // PostgreSQL refuses this rollback while incomplete drafts exist; nothing is
    // filled in or deleted, and the whole rollback is atomic.
    for (const [table, columns] of Object.entries(fields)) {
      for (const column of columns) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`,
          { transaction },
        );
      }
    }
  });
}
