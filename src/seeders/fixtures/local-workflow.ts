import { createHash } from 'node:crypto';
import { AdminRole, MoveRequestType, ResidentType } from '../../types/domain';

// Deterministic UUIDs identify seed-owned primary keys only, never foreign keys.
// Keeping this namespace stable lets revert target only this fixture's rows.
export function seedId(key: string): string {
  const hash = createHash('sha1').update(`anacity:local-workflow:v1:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const communities = [
  { name: 'Green Heights', code: 'GREEN_HEIGHTS', address: 'Bangalore', isActive: true },
  { name: 'Marina Residence', code: 'MARINA_RESIDENCE', address: 'Bangalore', isActive: true },
];

export const units = [
  { communityCode: 'GREEN_HEIGHTS', unitNumber: 'A-101', tower: 'A', floor: 1 },
  { communityCode: 'GREEN_HEIGHTS', unitNumber: 'A-102', tower: 'A', floor: 1 },
  { communityCode: 'GREEN_HEIGHTS', unitNumber: 'B-201', tower: 'B', floor: 2 },
  { communityCode: 'MARINA_RESIDENCE', unitNumber: 'M-101', tower: 'M', floor: 1 },
  { communityCode: 'MARINA_RESIDENCE', unitNumber: 'M-102', tower: 'M', floor: 1 },
  { communityCode: 'MARINA_RESIDENCE', unitNumber: 'M-201', tower: 'M', floor: 2 },
];

export const residents = [
  { communityCode: 'GREEN_HEIGHTS', unitNumber: 'A-101', tower: 'A', name: 'Ananya Rao', email: 'ananya.rao@green-heights.example.test', phone: '+919000000101', residentType: ResidentType.OWNER },
  { communityCode: 'GREEN_HEIGHTS', unitNumber: 'A-102', tower: 'A', name: 'Rohan Mehta', email: 'rohan.mehta@green-heights.example.test', phone: '+919000000102', residentType: ResidentType.TENANT },
  { communityCode: 'MARINA_RESIDENCE', unitNumber: 'M-101', tower: 'M', name: 'Kavya Nair', email: 'kavya.nair@marina-residence.example.test', phone: '+919000000201', residentType: ResidentType.TENANT },
  { communityCode: 'MARINA_RESIDENCE', unitNumber: 'M-201', tower: 'M', name: 'Arjun Iyer', email: 'arjun.iyer@marina-residence.example.test', phone: '+919000000202', residentType: ResidentType.OWNER },
];

export const admins = [
  { communityCode: 'GREEN_HEIGHTS', name: 'Meera Desai', email: 'meera.desai@green-heights.example.test', phone: '+919000000301', role: AdminRole.ADMIN },
  { communityCode: 'MARINA_RESIDENCE', name: 'Vikram Shah', email: 'vikram.shah@marina-residence.example.test', phone: '+919000000302', role: AdminRole.ADMIN },
];

const greenDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const marinaDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const greenSlots = [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }];
const marinaSlots = [{ start: '08:00', end: '11:00' }, { start: '13:00', end: '16:00' }];

export const workflowConfigs = [
  {
    communityCode: 'GREEN_HEIGHTS', requestType: MoveRequestType.MOVE_IN,
    requiredFields: ['requestedDate', 'requestedTimeSlot', 'vehicleCount', 'occupantCount'],
    requiredDocuments: [],
    allowedDays: greenDays, allowedTimeSlots: greenSlots,
    instructions: 'Move-in is allowed Monday to Saturday between approved time slots.',
  },
  {
    communityCode: 'GREEN_HEIGHTS', requestType: MoveRequestType.MOVE_OUT,
    requiredFields: ['requestedDate', 'requestedTimeSlot', 'vehicleCount'],
    requiredDocuments: [],
    allowedDays: greenDays, allowedTimeSlots: greenSlots,
    instructions: 'Move-out is allowed Monday to Saturday between approved time slots. Coordinate lift access with the community office.',
  },
  {
    communityCode: 'MARINA_RESIDENCE', requestType: MoveRequestType.MOVE_IN,
    requiredFields: ['requestedDate', 'requestedTimeSlot', 'occupantCount'],
    requiredDocuments: [],
    allowedDays: marinaDays, allowedTimeSlots: marinaSlots,
    instructions: 'Move-in is allowed Monday to Friday between approved time slots. Obtain owner authorization before submitting.',
  },
  {
    communityCode: 'MARINA_RESIDENCE', requestType: MoveRequestType.MOVE_OUT,
    requiredFields: ['requestedDate', 'requestedTimeSlot'],
    requiredDocuments: [],
    allowedDays: marinaDays, allowedTimeSlots: marinaSlots,
    instructions: 'Move-out is allowed Monday to Friday between approved time slots. Arrange key handover with the community office.',
  },
];

export const requestFixtures = [
  { key: 'green-draft-in', communityCode: 'GREEN_HEIGHTS', residentEmail: residents[0].email, type: MoveRequestType.MOVE_IN, stage: 'draft', dayOffset: 0, requestedTimeSlot: '09:00-12:00', occupantCount: 3 },
  { key: 'green-submitted-out', communityCode: 'GREEN_HEIGHTS', residentEmail: residents[1].email, type: MoveRequestType.MOVE_OUT, stage: 'submitted', dayOffset: 1, requestedTimeSlot: '14:00-17:00', occupantCount: 2 },
  { key: 'marina-approved-in', communityCode: 'MARINA_RESIDENCE', residentEmail: residents[2].email, type: MoveRequestType.MOVE_IN, stage: 'approved', dayOffset: 2, requestedTimeSlot: '08:00-11:00', occupantCount: 2 },
] as const;

export const checklistKeys = ['MOVE_DETAILS', 'ADMIN_REVIEW'] as const;
