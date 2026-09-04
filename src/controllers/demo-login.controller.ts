import type { ErrorRequestHandler, RequestHandler } from 'express';
import { loginByEmail } from '../services/demo-login.service';
import { parseLoginEmail } from '../validation/demo-login';
import { ApiError } from '../types/api';

export const demoLogin: RequestHandler = async (req, res) => {
  console.log("comig here ===>")
  return res.json(await loginByEmail(parseLoginEmail(req.body)));
};

// Include the login contract's message alongside the usual structured errors.
// Unexpected errors still pass through the application's sanitized error handler.
export const demoLoginError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (!(error instanceof ApiError)) { next(error); return; }
  res.status(error.status).json({ success: false, message: error.errors[0]?.message, errors: error.errors });
};
