import { STATUS_CODES } from 'node:http';
import type {
  ApiErrorBody,
  ErrorCode,
} from '@sistema-agendamento/shared-types';
import { ERROR_MESSAGE, ERROR_STATUS } from './error-codes';

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}

export function errorBody(
  code: ErrorCode,
  details?: Record<string, unknown>,
): ApiErrorBody {
  const statusCode = ERROR_STATUS[code];
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    code,
    message: ERROR_MESSAGE[code],
    ...(details ? { details } : {}),
  };
}
