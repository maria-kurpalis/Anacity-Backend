import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from '../config/database';

export const migrator = new Umzug({
  migrations: { glob: ['[0-9]*.js', { cwd: __dirname }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function main(): Promise<void> {
  try {
    const command = process.argv[2];
    if (!['up', 'down', 'status'].includes(command ?? '')) {
      throw new Error('Expected migration command: up, down, or status');
    }
    await sequelize.authenticate();
    if (command === 'up') {
      await migrator.up();
    } else if (command === 'down') {
      // Roll back just the latest migration; repeat to walk back dependencies.
      await migrator.down();
    } else {
      console.table([
        ...(await migrator.executed()).map(({ name }) => ({ name, status: 'applied' })),
        ...(await migrator.pending()).map(({ name }) => ({ name, status: 'pending' })),
      ]);
    }
  } catch (error) {
    // Migration names and constraint errors help diagnose failures without dumping SQL parameters.
    console.error(error instanceof Error ? error.message : 'Migration failed');
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  void main();
}
