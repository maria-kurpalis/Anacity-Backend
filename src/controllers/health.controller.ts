import type { RequestHandler } from 'express';
import { getHealth } from '../services/health.service';
import type { HealthResponse } from '../types/health';

export const healthCheck: RequestHandler<Record<string, never>, HealthResponse> = (_req, res) => {
  res.status(200).json(getHealth());
};
