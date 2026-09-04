import { ApiError } from '../types/api';
import { bodyObject } from './move-request';

export function parseLoginEmail(value: unknown): string {
  const { email } = bodyObject(value, ['email']);
  if (email === undefined || (typeof email === 'string' && !email.trim())) {
    throw new ApiError(400, [{ field: 'email', message: 'Enter your email address.' }]);
  }
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new ApiError(400, [{ field: 'email', message: 'Enter a valid email address.' }]);
  }
  console.log("email",email)
  return email.trim().toLowerCase();
}
