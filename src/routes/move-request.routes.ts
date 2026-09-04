import { Router } from 'express';
import * as controller from '../controllers/move-request.controller';
import { requestAccess } from '../middleware/prototype-access';

export const moveRequestRouter = Router();
moveRequestRouter.post('/move-requests', controller.create);
moveRequestRouter.get('/residents/:residentId/move-requests', controller.listForResident);
moveRequestRouter.get('/move-requests/:id', requestAccess('participant'), controller.getDetails);
moveRequestRouter.get('/move-requests/:id/progress', requestAccess('participant'), controller.getProgress);
moveRequestRouter.patch('/move-requests/:id', requestAccess('resident'), controller.update);
moveRequestRouter.post('/move-requests/:id/submit', requestAccess('resident'), controller.submit);
moveRequestRouter.post('/move-requests/:id/cancel', controller.cancel);
