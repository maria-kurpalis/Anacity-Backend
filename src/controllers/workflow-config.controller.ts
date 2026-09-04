import type { RequestHandler } from 'express';
import * as service from '../services/workflow-config.service';
import { parseId } from '../validation/move-request';
import { parsePutWorkflowConfigInput, parseRequestType } from '../validation/workflow-config';

export const get: RequestHandler = async (req, res) => {
  const data = await service.getWorkflowConfig(parseId(req.params.communityId, 'communityId'), parseRequestType(req.params.requestType));
  res.json({ success: true, data });
};

export const put: RequestHandler = async (req, res) => {
  const data = await service.putWorkflowConfig(parseId(req.params.communityId, 'communityId'), parseRequestType(req.params.requestType), parsePutWorkflowConfigInput(req.body));
  res.json({ success: true, data });
};
