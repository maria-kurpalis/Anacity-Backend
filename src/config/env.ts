import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production');
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
try {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error('Invalid PostgreSQL URL');
  }
} catch {
  throw new Error('DATABASE_URL must be a PostgreSQL URL with a host and database name');
}

const dbSsl = process.env.DB_SSL ?? 'false';
if (!['true', 'false'].includes(dbSsl)) {
  throw new Error('DB_SSL must be true or false');
}

export const env = {
  nodeEnv,
  port,
  databaseUrl,
  dbSsl: dbSsl === 'true',
};
