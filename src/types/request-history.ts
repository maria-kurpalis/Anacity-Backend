import type { ActorType } from './domain';

export interface AuditLogQuery {
  adminId: string;
  actorType?: ActorType;
  action?: string;
}
