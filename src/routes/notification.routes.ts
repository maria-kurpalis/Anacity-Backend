import { Router } from 'express';
import * as controller from '../controllers/notification.controller';

export const notificationRouter = Router();
notificationRouter.get('/residents/:residentId/notifications', controller.listForResident);
notificationRouter.get('/admin/:adminId/notifications', controller.listForAdmin);
