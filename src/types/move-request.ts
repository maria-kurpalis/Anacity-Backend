import type { MoveRequestType } from './domain';
import type { JsonData } from './json';

export interface CreateMoveRequestInput {
  residentId: string;
  type: MoveRequestType;
}

export interface UpdateMoveRequestInput {
  requestedDate?: string | null;
  requestedTimeSlot?: string | null;
  vehicleCount?: number | null;
  vehicleDetails?: JsonData | null;
  occupantCount?: number | null;
  notes?: string | null;
}
