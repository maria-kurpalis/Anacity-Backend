import { createAuditLog } from './audit-log.service';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { Document, MoveRequest, RequestComment, DocumentStatus, ActorType, CommentAuthorType } from '../models';
import { ApiError } from '../types/api';
import type { AddDocumentInput, UpdateDocumentInput } from '../types/document';
import type { AdminReasonInput, AdminReviewInput } from '../types/admin-move-request';
import { lockMoveRequest, requireCommunityAdmin } from './move-request-access.service';
import { assertMoveRequestEditable } from './move-request-state.service';

async function lockRequestDocument(moveRequestId: string, documentId: string, transaction: Transaction): Promise<Document> {
  const document = await Document.findOne({
    where: { id: documentId, moveRequestId }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!document) throw new ApiError(404, [{ field: 'documentId', message: 'Document not found for this move request.' }]);
  return document;
}

function documentSnapshot(document: Document) {
  return {
    id: document.id, documentType: document.documentType, fileUrl: document.fileUrl, status: document.status,
    uploadedAt: document.uploadedAt.toISOString(), verifiedBy: document.verifiedBy,
    verifiedAt: document.verifiedAt?.toISOString() ?? null,
  };
}

export async function addDocument(id: string, input: AddDocumentInput): Promise<Document> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    assertMoveRequestEditable(request.status);
    const uploadedAt = new Date();
    const document = await Document.create({
      moveRequestId: id, documentType: input.documentType, fileUrl: input.fileUrl,
      status: DocumentStatus.PENDING, uploadedAt, verifiedBy: null, verifiedAt: null,
    }, { transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.RESIDENT, actorId: request.residentId,
      action: 'DOCUMENT_ADDED', previousValue: null, newValue: documentSnapshot(document),
      metadata: { documentId: document.id }, createdAt: uploadedAt,
      transaction,
    });
    return document;
  });
}

export async function getRequestDocuments(id: string): Promise<Document[]> {
  if (!await MoveRequest.findByPk(id, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'id', message: 'Move request not found.' }]);
  }
  return Document.findAll({
    where: { moveRequestId: id }, order: [['uploadedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

export async function updateDocument(id: string, documentId: string, input: UpdateDocumentInput): Promise<Document> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const document = await lockRequestDocument(id, documentId, transaction);
    assertMoveRequestEditable(request.status);
    const previousValue = documentSnapshot(document);
    const uploadedAt = new Date();
    await document.update({
      fileUrl: input.fileUrl, status: DocumentStatus.PENDING, verifiedBy: null, verifiedAt: null, uploadedAt,
    }, { transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.RESIDENT, actorId: request.residentId,
      action: 'DOCUMENT_UPDATED', previousValue, newValue: documentSnapshot(document),
      metadata: { documentId }, createdAt: uploadedAt,
      transaction,
    });
    return document;
  });
}

export async function deleteDocument(id: string, documentId: string): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const document = await lockRequestDocument(id, documentId, transaction);
    assertMoveRequestEditable(request.status);
    const previousValue = documentSnapshot(document);
    await document.destroy({ transaction });
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.RESIDENT, actorId: request.residentId,
      action: 'DOCUMENT_DELETED', previousValue, newValue: null, metadata: { documentId },
      transaction,
    });
  });
}

type DocumentDecision = { status: DocumentStatus.VERIFIED } | { status: DocumentStatus.REJECTED; reason: string };

async function reviewDocument(id: string, documentId: string, adminId: string, decision: DocumentDecision): Promise<Document> {
  return sequelize.transaction(async (transaction) => {
    const request = await lockMoveRequest(id, transaction);
    const admin = await requireCommunityAdmin(adminId, request.communityId, transaction);
    const document = await lockRequestDocument(id, documentId, transaction);
    const previousValue = documentSnapshot(document);
    const verifiedAt = new Date();
    // For either decision these fields record the admin who checked the document.
    await document.update({ status: decision.status, verifiedBy: admin.id, verifiedAt }, { transaction });
    if (decision.status === DocumentStatus.REJECTED) {
      await RequestComment.create({
        moveRequestId: id, authorType: CommentAuthorType.ADMIN, authorId: admin.id,
        comment: `Document ${document.documentType} (${document.id}) rejected: ${decision.reason}`, createdAt: verifiedAt,
      }, { transaction });
    }
    await createAuditLog({
      moveRequestId: id, actorType: ActorType.ADMIN, actorId: admin.id,
      action: decision.status === DocumentStatus.VERIFIED ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      previousValue, newValue: documentSnapshot(document),
      metadata: { documentId, ...(decision.status === DocumentStatus.REJECTED ? { reason: decision.reason } : {}) },
      createdAt: verifiedAt,
      transaction,
    });
    return document;
  });
}

export function verifyDocument(id: string, documentId: string, input: AdminReviewInput): Promise<Document> {
  return reviewDocument(id, documentId, input.adminId, { status: DocumentStatus.VERIFIED });
}

export function rejectDocument(id: string, documentId: string, input: AdminReasonInput): Promise<Document> {
  return reviewDocument(id, documentId, input.adminId, { status: DocumentStatus.REJECTED, reason: input.reason });
}
