import type { HealthResponse } from '../types/health';

export function getHealth(): HealthResponse {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
