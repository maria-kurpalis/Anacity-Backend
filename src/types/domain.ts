export enum ResidentType {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
}

export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export enum MoveRequestType {
  MOVE_IN = 'MOVE_IN',
  MOVE_OUT = 'MOVE_OUT',
}

export enum MoveRequestStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  NEEDS_CHANGES = 'NEEDS_CHANGES',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum ChecklistStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum ChecklistCompletedByType {
  RESIDENT = 'RESIDENT',
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

export enum CommentAuthorType {
  RESIDENT = 'RESIDENT',
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
}

export enum AgentConversationRole {
  USER = 'USER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

export enum AgentAssessmentRecommendation {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_CHANGES = 'REQUEST_CHANGES',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum ActorType {
  RESIDENT = 'RESIDENT',
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

export enum NotificationRecipientType {
  RESIDENT = 'RESIDENT',
  ADMIN = 'ADMIN',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum AgentToolExecutionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
