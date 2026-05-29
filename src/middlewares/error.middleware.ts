import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`${req.method} ${req.path} - ${statusCode} - ${message}`, {
    stack: err.stack,
    body: req.body,
    params: req.params,
  });

  res.status(statusCode).json({
    success: false,
    message,
    ...(config.isDev && { stack: err.stack }),
  });
};
