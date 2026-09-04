import { Router } from 'express';
import * as controller from '../controllers/admin-move-request.controller';
import { communityAdminAccess, requestAccess } from '../middleware/prototype-access';

export const adminMoveRequestRouter = Router();
adminMoveRequestRouter.get('/admin/communities/:communityId/move-requests', communityAdminAccess, controller.listForCommunity);
adminMoveRequestRouter.get('/admin/move-requests/:id', requestAccess('admin'), controller.getForReview);
adminMoveRequestRouter.post('/admin/move-requests/:id/review', controller.review);
adminMoveRequestRouter.post('/admin/move-requests/:id/approve', controller.approve);
adminMoveRequestRouter.post('/admin/move-requests/:id/request-changes', controller.requestChanges);
adminMoveRequestRouter.post('/admin/move-requests/:id/reject', controller.reject);
adminMoveRequestRouter.post('/admin/move-requests/:id/complete', controller.complete);
