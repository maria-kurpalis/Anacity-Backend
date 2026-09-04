import type { Transaction } from 'sequelize';
import { AuditLog } from '../models';
import type { ActorType } from '../types/domain';
import type { JsonValue } from '../types/json';

export interface CreateAuditLogInput {
  moveRequestId?: string | null;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  previousValue?: JsonValue;
  newValue?: JsonValue;
  metadata?: JsonValue;
  createdAt?: Date;
  transaction?: Transaction;
}

export function createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
  return AuditLog.create({
    moveRequestId: input.moveRequestId ?? null, actorType: input.actorType, actorId: input.actorId,
    action: input.action, previousValue: input.previousValue ?? null, newValue: input.newValue ?? null,
    metadata: input.metadata ?? null, ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
  }, { transaction: input.transaction });
}
