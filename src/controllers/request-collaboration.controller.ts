import type { RequestHandler } from 'express';
import * as service from '../services/request-collaboration.service';
import { parseId } from '../validation/move-request';
import { parseAdminCommentInput, parseResidentCommentInput, parseUpdateChecklistInput } from '../validation/request-collaboration';

export const getChecklist: RequestHandler = async (req, res) => {
  const data = await service.getRequestChecklist(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const updateChecklist: RequestHandler = async (req, res) => {
  const data = await service.updateChecklistItem(parseId(req.params.id, 'id'), parseId(req.params.checklistId, 'checklistId'), parseUpdateChecklistInput(req.body));
  res.json({ success: true, data });
};

export const getComments: RequestHandler = async (req, res) => {
  const data = await service.getRequestComments(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const addResidentComment: RequestHandler = async (req, res) => {
  const data = await service.addResidentComment(parseId(req.params.id, 'id'), parseResidentCommentInput(req.body));
  res.status(201).json({ success: true, data });
};

export const addAdminComment: RequestHandler = async (req, res) => {
  const data = await service.addAdminComment(parseId(req.params.id, 'id'), parseAdminCommentInput(req.body));
  res.status(201).json({ success: true, data });
};
