import type { Server } from 'node:http';
import { app } from './app';
import { sequelize } from './config/database';
import { env } from './config/env';
import './models';

let server: Server | undefined;
let shuttingDown = false;

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10000);
  timeout.unref();

  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    await sequelize.close();
    process.exitCode = exitCode;
  } catch {
    console.error('Shutdown failed');
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

async function start(): Promise<void> {
  // Check connectivity only; schema changes must be managed through migrations.
  await sequelize.authenticate();
  if (shuttingDown) return;
  server = app.listen(env.port, () => {
    console.info(`API listening on port ${env.port}`);
  });
  server.on('error', () => {
    console.error('HTTP server failed');
    void shutdown(1);
  });
}

process.once('SIGTERM', () => { void shutdown(0); });
process.once('SIGINT', () => { void shutdown(0); });

void start().catch(() => {
  console.error('Startup failed; check PostgreSQL connectivity and configuration');
  void shutdown(1);
});
