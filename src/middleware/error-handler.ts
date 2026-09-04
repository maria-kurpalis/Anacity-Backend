import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ForeignKeyConstraintError, UniqueConstraintError, ValidationError } from 'sequelize';
import { ApiError } from '../types/api';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, errors: [{ field: 'path', message: 'Not found.' }] });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error('Request failed with a server or upstream error', {
        method: req.method,
        path: req.path,
        status: error.status,
        errors: error.errors,
      });
    }
    res.status(error.status).json({ success: false, errors: error.errors });
    return;
  }
  if (error instanceof ForeignKeyConstraintError || error instanceof UniqueConstraintError) {
    res.status(409).json({ success: false, errors: [{ field: 'request', message: 'The request conflicts with existing data.' }] });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(400).json({ success: false, errors: error.errors.map((item) => ({ field: item.path ?? 'request', message: 'Invalid value.' })) });
    return;
  }

  const candidate = typeof error === 'object' && error !== null && 'status' in error
    ? error.status : undefined;
  const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate < 500
    ? candidate : 500;

  if (status === 500) {
    // Avoid logging request bodies, database URLs, or other sensitive error details.
    console.error('Unhandled request error', {
      method: req.method,
      path: req.path,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
  res.status(status).json({ success: false, errors: [{ field: 'request', message: status === 500 ? 'Internal server error.' : 'Invalid request.' }] });
};
