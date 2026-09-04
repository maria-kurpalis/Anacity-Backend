import type { Transaction } from 'sequelize';
import { Admin, MoveRequest, Resident } from '../models';
import { ApiError } from '../types/api';
import type { AgentIdentity } from '../types/agent';

export async function lockMoveRequest(id: string, transaction: Transaction): Promise<MoveRequest> {
  // All request/document mutations lock this parent first, including submission.
  const request = await MoveRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!request) throw new ApiError(404, [{ field: 'id', message: 'Move request not found.' }]);
  return request;
}

export async function requireCommunityAdmin(adminId: string, communityId: string, transaction: Transaction): Promise<Admin> {
  const admin = await Admin.findByPk(adminId, { transaction, lock: transaction.LOCK.SHARE });
  if (!admin) throw new ApiError(404, [{ field: 'adminId', message: 'Admin not found.' }]);
  if (admin.communityId !== communityId) {
    throw new ApiError(403, [{ field: 'adminId', message: 'Admin must belong to the specified community.' }]);
  }
  return admin;
}

export async function requireRequestResident(residentId: string, request: MoveRequest, transaction: Transaction): Promise<Resident> {
  const resident = await Resident.findByPk(residentId, { transaction, lock: transaction.LOCK.SHARE });
  if (!resident) throw new ApiError(404, [{ field: 'residentId', message: 'Resident not found.' }]);
  if (resident.id !== request.residentId) {
    throw new ApiError(403, [{ field: 'residentId', message: 'Resident must own the move request.' }]);
  }
  return resident;
}

export async function requireRequestParticipant(identity: AgentIdentity, request: MoveRequest, transaction: Transaction): Promise<void> {
  if ('residentId' in identity) await requireRequestResident(identity.residentId, request, transaction);
  else await requireCommunityAdmin(identity.adminId, request.communityId, transaction);
}
