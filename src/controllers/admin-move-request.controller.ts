import type { RequestHandler } from 'express';
import * as service from '../services/admin-move-request.service';
import { parseId } from '../validation/move-request';
import { parseApprovalInput, parseCommunityRequestFilters, parseReasonInput, parseReviewInput } from '../validation/admin-move-request';

export const listForCommunity: RequestHandler = async (req, res) => {
  const data = await service.getCommunityMoveRequests(parseId(req.params.communityId, 'communityId'), parseCommunityRequestFilters(req.query));
  res.json({ success: true, data });
};

export const getForReview: RequestHandler = async (req, res) => {
  const data = await service.getRequestForAdminReview(parseId(req.params.id, 'id'), req.query.adminId === undefined ? undefined : parseId(req.query.adminId, 'adminId'));
  res.json({ success: true, data });
};

export const review: RequestHandler = async (req, res) => {
  const data = await service.startReview(parseId(req.params.id, 'id'), parseReviewInput(req.body));
  res.json({ success: true, data });
};

export const approve: RequestHandler = async (req, res) => {
  const data = await service.approveRequest(parseId(req.params.id, 'id'), parseApprovalInput(req.body));
  res.json({ success: true, data });
};

export const requestChanges: RequestHandler = async (req, res) => {
  const data = await service.requestChanges(parseId(req.params.id, 'id'), parseReasonInput(req.body));
  res.json({ success: true, data });
};

export const reject: RequestHandler = async (req, res) => {
  const data = await service.rejectRequest(parseId(req.params.id, 'id'), parseReasonInput(req.body));
  res.json({ success: true, data });
};

export const complete: RequestHandler = async (req, res) => {
  const data = await service.completeRequest(parseId(req.params.id, 'id'), parseApprovalInput(req.body));
  res.json({ success: true, data });
};
