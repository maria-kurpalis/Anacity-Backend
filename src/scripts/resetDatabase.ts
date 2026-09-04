import 'dotenv/config';
import type { Sequelize } from 'sequelize';

export async function resetDatabase(): Promise<void> {
  let connection: Sequelize | undefined;
  try {
    // Check before importing the connection, models, or anything that can access the DB.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is disabled when NODE_ENV is production.');
    }

    const { sequelize } = await import('../config/database.js');
    connection = sequelize;
    await import('../models/index.js');
    const { seedDevelopmentData } = await import('../seeders/development-data.js');
    const { seedStorage, developmentSeedName } = await import('../seeders/storage.js');
    const {
      addResidentMembershipConstraint, addMoveRequestMembershipConstraints,
      addRequestDetailsCountChecks, addAuditLogAppendOnly, addStatusHistoryAppendOnly,
    } = await import('../migrations/support/initial-constraints.js');

    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Dropping and recreating tables...');
    const queryInterface = sequelize.getQueryInterface();
    // Never retain a migration ledger describing tables that have been replaced by sync.
    await queryInterface.dropTable('SequelizeMeta');
    // This is the only application-schema sync call. Production uses migrations.
    await sequelize.sync({ force: true });

    await sequelize.transaction(async (transaction) => {
      // sync omits SQL defaults for UUIDV4/NOW; preserve the migrated column defaults.
      for (const model of Object.values(sequelize.models)) {
        const attributes = model.getAttributes();
        if (!attributes.id) continue; // Exclude Umzug bookkeeping models.
        const name = model.getTableName();
        const table = typeof name === 'string' ? queryInterface.quoteIdentifier(name)
          : `${queryInterface.quoteIdentifier(name.schema)}.${queryInterface.quoteIdentifier(name.tableName)}`;
        const defaults = ['ALTER COLUMN "id" SET DEFAULT gen_random_uuid()'];
        for (const timestamp of ['createdAt', 'updatedAt']) {
          if (attributes[timestamp]) defaults.push(`ALTER COLUMN "${timestamp}" SET DEFAULT CURRENT_TIMESTAMP`);
        }
        await sequelize.query(`ALTER TABLE ${table} ${defaults.join(', ')}`, { transaction });
      }
      await addResidentMembershipConstraint(queryInterface, transaction);
      await addMoveRequestMembershipConstraints(queryInterface, transaction);
      await addRequestDetailsCountChecks(queryInterface, transaction);
      // Dropping a table removes its triggers, but standalone functions can remain.
      await sequelize.query('DROP FUNCTION IF EXISTS reject_audit_logs_mutation()', { transaction });
      await sequelize.query('DROP FUNCTION IF EXISTS reject_status_histories_mutation()', { transaction });
      await addAuditLogAppendOnly(queryInterface, transaction);
      await addStatusHistoryAppendOnly(queryInterface, transaction);
    });

    console.log('Database schema created.');
    console.log('Seeding development data...');
    await seedDevelopmentData();
    await seedStorage.logMigration({ name: developmentSeedName });
    console.log('Seed data created.');
  } finally {
    await connection?.close();
  }
  console.log('Database reset completed successfully.');
}

if (require.main === module) {
  resetDatabase().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Database reset failed.');
    process.exitCode = 1;
  });
}
