import type { QueryInterface } from 'sequelize';

// Data-only cleanup for existing communities; retain every other configured rule
// and all historical detail/document rows. New databases use the updated seeds.
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(`UPDATE community_workflow_configs
      SET "requiredFields" = "requiredFields" - 'movingCompany',
          "requiredDocuments" = "requiredDocuments" - 'TENANCY_AGREEMENT',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "requiredFields" ? 'movingCompany' OR "requiredDocuments" ? 'TENANCY_AGREEMENT'`, { transaction });
  });
}

export async function down(): Promise<void> {
  // Intentional one-way data cleanup: rollback must not invent requirements or
  // overwrite subsequent community-admin edits. No schema objects were changed.
}
