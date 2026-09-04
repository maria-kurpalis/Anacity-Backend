import { Router } from 'express';
import * as controller from '../controllers/request-collaboration.controller';
import { requestAccess } from '../middleware/prototype-access';

export const requestCollaborationRouter = Router();
requestCollaborationRouter.get('/move-requests/:id/checklist', requestAccess('participant'), controller.getChecklist);
requestCollaborationRouter.patch('/admin/move-requests/:id/checklist/:checklistId', controller.updateChecklist);
requestCollaborationRouter.get('/move-requests/:id/comments', requestAccess('participant'), controller.getComments);
requestCollaborationRouter.post('/move-requests/:id/comments', controller.addResidentComment);
requestCollaborationRouter.post('/admin/move-requests/:id/comments', controller.addAdminComment);
requestCollaborationRouter.post('/move-requests/:id/comments/admin', controller.addAdminComment);
