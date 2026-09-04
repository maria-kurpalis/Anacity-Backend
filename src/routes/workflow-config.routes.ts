import { Router } from 'express';
import * as controller from '../controllers/workflow-config.controller';

export const workflowConfigRouter = Router();
workflowConfigRouter.get('/communities/:communityId/workflow-config/:requestType', controller.get);
workflowConfigRouter.put('/admin/communities/:communityId/workflow-config/:requestType', controller.put);
