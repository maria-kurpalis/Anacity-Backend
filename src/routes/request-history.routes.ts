import { Router } from 'express';
import * as controller from '../controllers/request-history.controller';
import { requestAccess } from '../middleware/prototype-access';

export const requestHistoryRouter = Router();
requestHistoryRouter.get('/move-requests/:id/status-history', requestAccess('participant'), controller.getStatusHistory);
requestHistoryRouter.get('/admin/move-requests/:id/audit-logs', controller.getAuditLogs);
