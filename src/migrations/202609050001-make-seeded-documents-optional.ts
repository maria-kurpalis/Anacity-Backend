import type { QueryInterface } from 'sequelize';

// Current demo communities do not require documents. Keep the JSONB field and
// generic document workflow so future community configurations can opt in.
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(`UPDATE community_workflow_configs AS config
      SET "requiredDocuments" = '[]'::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM communities AS community
      WHERE config."communityId" = community.id
        AND community.code IN ('GREEN_HEIGHTS', 'MARINA_RESIDENCE')
        AND config."requiredDocuments" <> '[]'::jsonb`, { transaction });
  });
}

export async function down(): Promise<void> {
  // Intentional one-way policy update: rollback must not invent requirements or
  // overwrite later changes made by a community admin.
}
