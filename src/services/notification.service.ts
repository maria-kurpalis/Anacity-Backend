import type { Transaction } from 'sequelize';
import { Admin, Resident, Unit, Notification, NotificationChannel, NotificationRecipientType, NotificationStatus, MoveRequestStatus, MoveRequestType } from '../models';
import type { MoveRequest } from '../models';
import { ApiError } from '../types/api';

export interface CreateNotificationInput {
  moveRequestId?: string | null;
  recipientType: NotificationRecipientType;
  recipientId: string;
  channel?: NotificationChannel;
  title: string;
  message: string;
  transaction?: Transaction;
}

// Database outbox only. No delivery or external service is invoked.
export function createNotification(input: CreateNotificationInput): Promise<Notification> {
  return Notification.create({
    moveRequestId: input.moveRequestId ?? null, recipientType: input.recipientType, recipientId: input.recipientId,
    channel: input.channel ?? NotificationChannel.IN_APP, title: input.title, message: input.message,
    status: NotificationStatus.PENDING, sentAt: null,
  }, { transaction: input.transaction });
}

export async function getResidentNotifications(residentId: string): Promise<Notification[]> {
  if (!await Resident.findByPk(residentId, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'residentId', message: 'Resident not found.' }]);
  }
  return Notification.findAll({
    where: { recipientType: NotificationRecipientType.RESIDENT, recipientId: residentId },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

export async function getAdminNotifications(adminId: string): Promise<Notification[]> {
  if (!await Admin.findByPk(adminId, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'adminId', message: 'Admin not found.' }]);
  }
  return Notification.findAll({
    where: { recipientType: NotificationRecipientType.ADMIN, recipientId: adminId },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });
}

function moveLabel(request: MoveRequest): string {
  return request.type === MoveRequestType.MOVE_IN ? 'move-in' : 'move-out';
}

export async function notifyCommunityAdmins(request: MoveRequest, resubmitted: boolean, transaction: Transaction, cancellationReason?: string): Promise<void> {
  const admins = await Admin.findAll({ where: { communityId: request.communityId }, attributes: ['id'], transaction });
  const unit = await Unit.findByPk(request.unitId, { attributes: ['unitNumber'], transaction });
  if (!unit) throw new ApiError(404, [{ field: 'unitId', message: 'Unit not found.' }]);
  for (const admin of admins) {
    await createNotification({
      moveRequestId: request.id, recipientType: NotificationRecipientType.ADMIN, recipientId: admin.id,
      title: request.status === MoveRequestStatus.CANCELLED ? 'Move request cancelled' : resubmitted ? 'Move request resubmitted' : 'New move request submitted',
      message: request.status === MoveRequestStatus.CANCELLED ? `The ${moveLabel(request)} request for Unit ${unit.unitNumber} was cancelled. ${cancellationReason ?? ''}`.trim()
        : `${resubmitted ? 'A' : 'New'} ${moveLabel(request)} request ${resubmitted ? 'resubmitted' : 'submitted'} for Unit ${unit.unitNumber}.`,
      transaction,
    });
  }
}

export async function notifyResidentOfDecision(request: MoveRequest, reason: string | undefined, transaction: Transaction): Promise<void> {
  let title: string;
  let message: string;
  switch (request.status) {
    case MoveRequestStatus.APPROVED:
      title = 'Move request approved';
      message = `Your ${moveLabel(request)} request has been approved.`;
      break;
    case MoveRequestStatus.NEEDS_CHANGES:
      title = 'Changes requested';
      message = `Your ${moveLabel(request)} request needs changes. ${reason ?? ''}`.trim();
      break;
    case MoveRequestStatus.REJECTED:
      title = 'Move request rejected';
      message = `Your ${moveLabel(request)} request has been rejected. ${reason ?? ''}`.trim();
      break;
    case MoveRequestStatus.COMPLETED:
      title = 'Move request completed';
      message = `Your ${moveLabel(request)} request has been marked completed.`;
      break;
    default:
      return;
  }
  await createNotification({
    moveRequestId: request.id, recipientType: NotificationRecipientType.RESIDENT, recipientId: request.residentId,
    title, message, transaction,
  });
}
