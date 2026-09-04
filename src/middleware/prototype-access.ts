import type { RequestHandler } from 'express';
import { sequelize } from '../config/database';
import { Community } from '../models';
import { ApiError } from '../types/api';
import { parseId } from '../validation/move-request';
import { lockMoveRequest, requireCommunityAdmin, requireRequestResident } from '../services/move-request-access.service';

// These are explicitly selected demo identities, NOT authenticated credentials.
// Unscoped request APIs still have to verify ownership/community on the server.
export function requestAccess(mode: 'resident' | 'participant' | 'admin'): RequestHandler {
  return async (req, _res, next) => {
    const id = parseId(req.params.id, 'id');
    await sequelize.transaction(async (transaction) => {
      const request = await lockMoveRequest(id, transaction);
      const adminId = req.query.adminId ?? req.get('X-Admin-Id');
      if (mode === 'admin' || (mode === 'participant' && adminId !== undefined)) {
        await requireCommunityAdmin(parseId(adminId, 'adminId'), request.communityId, transaction);
      } else {
        await requireRequestResident(parseId(req.get('X-Resident-Id'), 'residentId'), request, transaction);
      }
    });
    next();
  };
}

export const communityAdminAccess: RequestHandler = async (req, _res, next) => {
  const communityId = parseId(req.params.communityId, 'communityId');
  await sequelize.transaction(async (transaction) => {
    const community = await Community.findByPk(communityId, { transaction });
    if (!community) throw new ApiError(404, [{ field: 'communityId', message: 'Community not found.' }]);
    await requireCommunityAdmin(parseId(req.get('X-Admin-Id'), 'adminId'), community.id, transaction);
  });
  next();
};
