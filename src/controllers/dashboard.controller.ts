import type { RequestHandler } from 'express';
import * as service from '../services/dashboard.service';
import { parseId } from '../validation/move-request';

export const resident: RequestHandler = async (req, res) => {
  const data = await service.getResidentDashboard(parseId(req.params.residentId, 'residentId'));
  res.json({ success: true, data });
};

export const admin: RequestHandler = async (req, res) => {
  const data = await service.getAdminDashboard(parseId(req.params.communityId, 'communityId'));
  res.json({ success: true, data });
};
