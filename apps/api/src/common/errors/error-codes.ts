import type { ErrorCode } from '@sistema-agendamento/shared-types';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PROCEDURE_NAME_TAKEN: 409,
  INVALID_DURATION: 422,
  PROCEDURE_INACTIVE: 422,
  NOT_A_HOLIDAY: 422,
};

// Mensagens fixas: nunca interpolam dado digitado (nada de dado pessoal em erro).
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Dados inválidos.',
  NOT_FOUND: 'Registro não encontrado.',
  UNSUPPORTED_MEDIA_TYPE: 'Tipo de conteúdo não suportado.',
  PROCEDURE_NAME_TAKEN: 'Já existe um procedimento ativo com esse nome.',
  INVALID_DURATION: 'Duração inválida.',
  PROCEDURE_INACTIVE: 'Procedimento indisponível.',
  NOT_A_HOLIDAY: 'A data informada não é um feriado.',
};
