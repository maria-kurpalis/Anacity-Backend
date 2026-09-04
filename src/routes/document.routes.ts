import { Router } from 'express';
import * as controller from '../controllers/document.controller';
import { requestAccess } from '../middleware/prototype-access';

export const documentRouter = Router();
documentRouter.post('/move-requests/:id/documents', requestAccess('resident'), controller.add);
documentRouter.get('/move-requests/:id/documents', requestAccess('participant'), controller.list);
documentRouter.patch('/move-requests/:id/documents/:documentId', requestAccess('resident'), controller.update);
documentRouter.delete('/move-requests/:id/documents/:documentId', requestAccess('resident'), controller.remove);
documentRouter.post('/admin/move-requests/:id/documents/:documentId/verify', controller.verify);
documentRouter.post('/admin/move-requests/:id/documents/:documentId/reject', controller.reject);
