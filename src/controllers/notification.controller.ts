import type { RequestHandler } from 'express';
import * as service from '../services/notification.service';
import { parseId } from '../validation/move-request';

export const listForResident: RequestHandler = async (req, res) => {
  const data = await service.getResidentNotifications(parseId(req.params.residentId, 'residentId'));
  res.json({ success: true, data });
};

export const listForAdmin: RequestHandler = async (req, res) => {
  const data = await service.getAdminNotifications(parseId(req.params.adminId, 'adminId'));
  res.json({ success: true, data });
};
