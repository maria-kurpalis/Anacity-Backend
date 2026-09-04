import type { RequestHandler } from 'express';
import * as service from '../services/move-request.service';
import { getMoveRequestProgress } from '../services/request-progress.service';
import { parseCancelInput, parseCreateInput, parseId, parseUpdateInput, validateSubmitBody } from '../validation/move-request';

export const create: RequestHandler = async (req, res) => {
  const data = await service.createMoveRequest(parseCreateInput(req.body));
  res.status(201).json({ success: true, data });
};

export const listForResident: RequestHandler = async (req, res) => {
  const data = await service.getResidentMoveRequests(parseId(req.params.residentId, 'residentId'));
  res.json({ success: true, data });
};

export const getDetails: RequestHandler = async (req, res) => {
  const data = await service.getMoveRequestDetails(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const getProgress: RequestHandler = async (req, res) => {
  const data = await getMoveRequestProgress(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const data = await service.updateMoveRequest(parseId(req.params.id, 'id'), parseUpdateInput(req.body));
  res.json({ success: true, data });
};

export const submit: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id, 'id');
  validateSubmitBody(req.body);
  const data = await service.submitMoveRequest(id);
  res.json({ success: true, data });
};

export const cancel: RequestHandler = async (req, res) => {
  const input = parseCancelInput(req.body);
  const data = await service.cancelMoveRequest(parseId(req.params.id, 'id'), input.residentId, input.reason);
  res.json({ success: true, data });
};
