// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ApiErrorBody, ErrorCode } from '@sistema-agendamento/shared-types';
import { DEFAULT_ERROR_MESSAGE, messageFor, readApiError } from './api-errors';

// Camada W. Lista explícita dos códigos da fatia 1 (packages/shared-types/src/error-codes.ts).
// O Record garante em compilação que nenhum código novo fique sem linha aqui.
const SLICE_1_CODES: Record<ErrorCode, true> = {
  VALIDATION_FAILED: true,
  NOT_FOUND: true,
  UNSUPPORTED_MEDIA_TYPE: true,
  PROCEDURE_NAME_TAKEN: true,
  INVALID_DURATION: true,
  PROCEDURE_INACTIVE: true,
  NOT_A_HOLIDAY: true,
};

describe('[W] messageFor', () => {
  it.each(Object.keys(SLICE_1_CODES))('[W] %s tem mensagem própria em pt-BR', (code) => {
    const message = messageFor(code);
    expect(message).not.toBe(DEFAULT_ERROR_MESSAGE);
    expect(message.trim()).not.toBe('');
  });

  it('[W] as mensagens dos códigos são todas distintas entre si', () => {
    const messages = Object.keys(SLICE_1_CODES).map((c) => messageFor(c));
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('[W] código desconhecido cai na mensagem padrão', () => {
    expect(messageFor('ALGO_QUE_NAO_EXISTE')).toBe('Algo deu errado. Tente de novo.');
  });

  it('[W] undefined cai na mensagem padrão', () => {
    expect(messageFor(undefined)).toBe('Algo deu errado. Tente de novo.');
  });
});

describe('[W] readApiError', () => {
  it('[W] corpo ApiErrorBody -> code e mensagem pt-BR do código (não a da API)', async () => {
    // Dado uma resposta 409 no formato ApiErrorBody
    const body: ApiErrorBody = {
      statusCode: 409,
      error: 'Conflict',
      code: 'PROCEDURE_NAME_TAKEN',
      message: 'procedure name taken (texto técnico da API)',
    };
    const res = new Response(JSON.stringify(body), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
    // Quando
    const result = await readApiError(res);
    // Então
    expect(result).toEqual({
      code: 'PROCEDURE_NAME_TAKEN',
      message: messageFor('PROCEDURE_NAME_TAKEN'),
    });
  });

  it('[W] corpo com details também devolve o code', async () => {
    const body: ApiErrorBody = {
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_FAILED',
      message: 'validation failed',
      details: { fields: { name: ['obrigatório'] } },
    };
    const res = new Response(JSON.stringify(body), { status: 400 });
    const result = await readApiError(res);
    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.message).toBe(messageFor('VALIDATION_FAILED'));
  });

  it('[W] corpo JSON com code desconhecido -> mensagem padrão', async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 418, error: 'x', code: 'NOVO_CODIGO', message: 'm' }),
      { status: 418 },
    );
    const result = await readApiError(res);
    expect(result.message).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('[W] corpo não-JSON (HTML) -> mensagem padrão, sem lançar e sem code', async () => {
    const res = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    const result = await readApiError(res);
    expect(result).toEqual({ message: DEFAULT_ERROR_MESSAGE });
  });

  it('[W] corpo vazio -> mensagem padrão, sem lançar e sem code', async () => {
    const res = new Response(null, { status: 500 });
    const result = await readApiError(res);
    expect(result).toEqual({ message: DEFAULT_ERROR_MESSAGE });
  });
});
