import type { RequestHandler } from 'express';
import * as service from '../services/agent.service';
import { parseId } from '../validation/move-request';
import { parseReviewInput } from '../validation/admin-move-request';
import { parseAgentChatInput, parseAgentAdminQuery, parseAgentConversationQuery } from '../validation/agent';
import { getAgentConversations } from '../services/agent-conversation.service';
import { getAIConfigurationStatus } from '../config/ai';
import { buildMoveRequestAgentSummary } from '../services/agent-summary.service';

export const chat: RequestHandler = async (req, res) => {
  const data = await service.chatWithResident(parseId(req.params.id, 'id'), parseAgentChatInput(req.body));
  res.json({ success: true, data });
};

export const generateAssessment: RequestHandler = async (req, res) => {
  const { adminId } = parseReviewInput(req.body);
  const data = await service.generateAgentAssessment(parseId(req.params.id, 'id'), adminId);
  res.status(201).json({ success: true, data });
};

export const latestAssessment: RequestHandler = async (req, res) => {
  const data = await service.getLatestAgentAssessment(parseId(req.params.id, 'id'), parseAgentAdminQuery(req.query));
  res.json({ success: true, data });
};

export const conversations: RequestHandler = async (req, res) => {
  const result = await getAgentConversations(parseId(req.params.id, 'id'), parseAgentConversationQuery(req.query));
  res.json({ success: true, ...result });
};

export const health: RequestHandler = (_req, res) => {
  res.json(getAIConfigurationStatus());
};

export const summary: RequestHandler = async (req, res) => {
  const adminId = parseAgentAdminQuery(req.query);
  const data = await buildMoveRequestAgentSummary(parseId(req.params.id, 'id'), { identity: { adminId } });
  res.json({ success: true, data });
};
