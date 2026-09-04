import type { RequestHandler } from 'express';
import * as service from '../services/document.service';
import { parseId } from '../validation/move-request';
import { parseReviewInput, parseReasonInput } from '../validation/admin-move-request';
import { parseAddDocumentInput, parseUpdateDocumentInput, validateDeleteDocumentBody } from '../validation/document';

export const add: RequestHandler = async (req, res) => {
  const data = await service.addDocument(parseId(req.params.id, 'id'), parseAddDocumentInput(req.body));
  res.status(201).json({ success: true, data });
};

export const list: RequestHandler = async (req, res) => {
  const data = await service.getRequestDocuments(parseId(req.params.id, 'id'));
  res.json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const data = await service.updateDocument(parseId(req.params.id, 'id'), parseId(req.params.documentId, 'documentId'), parseUpdateDocumentInput(req.body));
  res.json({ success: true, data });
};

export const remove: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id, 'id');
  const documentId = parseId(req.params.documentId, 'documentId');
  validateDeleteDocumentBody(req.body);
  await service.deleteDocument(id, documentId);
  res.json({ success: true, data: { id: documentId } });
};

export const verify: RequestHandler = async (req, res) => {
  const data = await service.verifyDocument(parseId(req.params.id, 'id'), parseId(req.params.documentId, 'documentId'), parseReviewInput(req.body));
  res.json({ success: true, data });
};

export const reject: RequestHandler = async (req, res) => {
  const data = await service.rejectDocument(parseId(req.params.id, 'id'), parseId(req.params.documentId, 'documentId'), parseReasonInput(req.body));
  res.json({ success: true, data });
};
