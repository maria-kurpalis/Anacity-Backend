import { Umzug } from 'umzug';
import { sequelize } from '../config/database';
import { migrator } from '../migrations/runner';
import { seedStorage } from './storage';

export const seeder = new Umzug({
  migrations: { glob: ['[0-9]*.js', { cwd: __dirname }] },
  context: sequelize.getQueryInterface(),
  storage: seedStorage,
  logger: console,
});

async function main(): Promise<void> {
  try {
    const command = process.argv[2];
    if (!['up', 'down', 'status'].includes(command ?? '')) {
      throw new Error('Expected seed command: up, down, or status');
    }
    await sequelize.authenticate();
    if (command === 'up') {
      if ((await seeder.pending()).length && (await migrator.pending()).length) {
        throw new Error('Run npm run db:migrate before applying local seeds, or use npm run db:reset for a development database.');
      }
      await seeder.up();
    } else if (command === 'down') {
      await seeder.down();
    } else {
      console.table([
        ...(await seeder.executed()).map(({ name }) => ({ name, status: 'applied' })),
        ...(await seeder.pending()).map(({ name }) => ({ name, status: 'pending' })),
      ]);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Seed command failed');
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  void main();
}
