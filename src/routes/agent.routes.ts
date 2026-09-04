import { Router } from 'express';
import * as controller from '../controllers/agent.controller';

export const agentRouter = Router();
agentRouter.get('/agent/health', controller.health);
agentRouter.get('/move-requests/:id/agent-conversations', controller.conversations);
agentRouter.post('/agent/move-requests/:id/chat', controller.chat);
agentRouter.post('/admin/move-requests/:id/agent-assessment', controller.generateAssessment);
agentRouter.get('/admin/move-requests/:id/agent-assessment', controller.latestAssessment);
agentRouter.get('/admin/move-requests/:id/agent-summary', controller.summary);
