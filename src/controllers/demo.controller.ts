import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../types/api';
import { getDemoIdentities } from '../services/demo.service';

export const identities: RequestHandler = async (_req, res) => {
  if (env.nodeEnv === 'production') throw new ApiError(404, [{ field: 'route', message: 'Route not found.' }]);
  res.json({ success: true, data: await getDemoIdentities() });
};
