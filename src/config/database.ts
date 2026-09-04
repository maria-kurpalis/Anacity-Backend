import { Sequelize } from 'sequelize';
import { env } from './env';

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 0, acquire: 10000, idle: 10000 },
  dialectOptions: {
    connectionTimeoutMillis: 10000,
    ...(env.dbSsl ? { ssl: { require: true, rejectUnauthorized: true } } : {}),
  },
});
