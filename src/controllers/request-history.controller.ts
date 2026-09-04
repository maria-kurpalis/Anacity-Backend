import type { RequestHandler } from 'express';
import * as service from '../services/request-history.service';
import { parseId } from '../validation/move-request';
import { parseAuditLogQuery } from '../validation/request-history';

export const getStatusHistory: RequestHandler = async (req, res) => {
  const data = await service.getStatusHistory(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const getAuditLogs: RequestHandler = async (req, res) => {
  const data = await service.getAuditLogs(parseId(req.params.id, 'id'), parseAuditLogQuery(req.query));
  res.json({ success: true, data });
};
