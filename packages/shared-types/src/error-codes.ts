// Só os códigos da fatia 1; as fatias seguintes acrescentam (arquitetura §2.5).
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PROCEDURE_NAME_TAKEN'
  | 'INVALID_DURATION'
  | 'PROCEDURE_INACTIVE'
  | 'NOT_A_HOLIDAY';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
