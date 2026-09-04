import { sequelize } from '../config/database';
import { MoveRequest, StatusHistory, AuditLog } from '../models';
import { ApiError } from '../types/api';
import type { AuditLogQuery } from '../types/request-history';
import { requireCommunityAdmin } from './move-request-access.service';

export async function getStatusHistory(id: string): Promise<StatusHistory[]> {
  if (!await MoveRequest.findByPk(id, { attributes: ['id'] })) {
    throw new ApiError(404, [{ field: 'id', message: 'Move request not found.' }]);
  }
  return StatusHistory.findAll({ where: { moveRequestId: id }, order: [['createdAt', 'ASC'], ['id', 'ASC']] });
}

export async function getAuditLogs(id: string, query: AuditLogQuery): Promise<AuditLog[]> {
  return sequelize.transaction(async (transaction) => {
    const request = await MoveRequest.findByPk(id, { transaction, lock: transaction.LOCK.SHARE });
    if (!request) throw new ApiError(404, [{ field: 'id', message: 'Move request not found.' }]);
    await requireCommunityAdmin(query.adminId, request.communityId, transaction);
    return AuditLog.findAll({
      where: {
        moveRequestId: id,
        ...(query.actorType === undefined ? {} : { actorType: query.actorType }),
        ...(query.action === undefined ? {} : { action: query.action }),
      },
      order: [['createdAt', 'DESC'], ['id', 'DESC']], transaction,
    });
  });
}
