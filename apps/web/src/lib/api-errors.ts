import type { ApiErrorBody, ErrorCode } from '@sistema-agendamento/shared-types';

export const DEFAULT_ERROR_MESSAGE = 'Algo deu errado. Tente de novo.';

// Record: o compilador acusa código novo no shared-types sem mensagem aqui.
const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Alguns dados estão inválidos. Confira os campos e tente de novo.',
  NOT_FOUND: 'Não encontramos o que você procurou.',
  UNSUPPORTED_MEDIA_TYPE: 'O formato dos dados enviados não é aceito.',
  PROCEDURE_NAME_TAKEN: 'Já existe um procedimento com esse nome.',
  INVALID_DURATION: 'A duração deve ser um múltiplo de 15 minutos, dentro do limite permitido.',
  PROCEDURE_INACTIVE: 'Esse procedimento está inativo.',
  NOT_A_HOLIDAY: 'Esse dia não é um feriado.',
};

/** Mensagem pt-BR para cada ErrorCode da fatia 1; desconhecido/ausente -> DEFAULT_ERROR_MESSAGE. */
export function messageFor(code: string | undefined): string {
  if (code !== undefined && Object.hasOwn(MESSAGES, code)) return MESSAGES[code as ErrorCode];
  return DEFAULT_ERROR_MESSAGE;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}

/** Extrai o `code` de um corpo ApiErrorBody; qualquer outra coisa (HTML, vazio) -> undefined. */
export function parseErrorCode(body: unknown): ErrorCode | undefined {
  const code = (body as Partial<ApiErrorBody> | null)?.code;
  return isErrorCode(code) ? code : undefined;
}

/** Lê o corpo de erro da API de uma Response não-ok, sem nunca lançar. */
export async function readApiError(
  res: Response,
): Promise<{ code?: ErrorCode; message: string }> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { message: DEFAULT_ERROR_MESSAGE };
  }
  const code = parseErrorCode(body);
  return code ? { code, message: messageFor(code) } : { message: DEFAULT_ERROR_MESSAGE };
}
