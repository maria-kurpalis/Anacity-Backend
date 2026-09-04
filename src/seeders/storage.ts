import { SequelizeStorage } from 'umzug';
import { sequelize } from '../config/database';

export const developmentSeedName = '202609030001-local-workflow.js';

// Umzug bookkeeping only; no additional application model is introduced.
export const seedStorage = new SequelizeStorage({
  sequelize,
  modelName: 'SequelizeSeedMeta',
  tableName: 'SequelizeSeedMeta',
});
