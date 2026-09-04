import { ApiError } from '../types/api';
import type { AddDocumentInput, UpdateDocumentInput } from '../types/document';
import { bodyObject } from './move-request';

function parseFileUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, [{ field: 'fileUrl', message: 'File URL must be a nonempty string.' }]);
  }
  // Stored as supplied text; no file is fetched, uploaded or inspected here.
  return value.trim();
}

export function parseAddDocumentInput(value: unknown): AddDocumentInput {
  const body = bodyObject(value, ['documentType', 'fileUrl']);
  if (typeof body.documentType !== 'string' || !body.documentType.trim() || [...body.documentType.trim()].length > 100) {
    throw new ApiError(400, [{ field: 'documentType', message: 'Document type must be nonempty text of at most 100 characters.' }]);
  }
  return { documentType: body.documentType.trim(), fileUrl: parseFileUrl(body.fileUrl) };
}

export function parseUpdateDocumentInput(value: unknown): UpdateDocumentInput {
  const body = bodyObject(value, ['fileUrl']);
  return { fileUrl: parseFileUrl(body.fileUrl) };
}

export function validateDeleteDocumentBody(value: unknown): void {
  if (value !== undefined) bodyObject(value, []);
}
