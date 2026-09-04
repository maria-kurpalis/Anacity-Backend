import type { MoveRequest } from '../models/move-request';
import type { Community, Resident, Unit } from '../models';

export interface ResidentDashboard {
  resident: Pick<Resident, 'id' | 'name'>;
  community: Pick<Community, 'id' | 'name' | 'code'> | null;
  unit: Pick<Unit, 'id' | 'unitNumber' | 'tower' | 'floor'> | null;
  totalRequests: number;
  draftRequests: number;
  submittedRequests: number;
  needsChangesRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  completedRequests: number;
  recentRequests: MoveRequest[];
}

export interface AdminDashboard {
  community: Pick<Community, 'id' | 'name' | 'code'>;
  totalRequests: number;
  submittedRequests: number;
  underReviewRequests: number;
  needsChangesRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  completedRequests: number;
  moveInRequests: number;
  moveOutRequests: number;
  recentRequests: MoveRequest[];
}
