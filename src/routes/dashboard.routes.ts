import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { communityAdminAccess } from '../middleware/prototype-access';

export const dashboardRouter = Router();
dashboardRouter.get('/residents/:residentId/dashboard', controller.resident);
dashboardRouter.get('/admin/communities/:communityId/dashboard', communityAdminAccess, controller.admin);
