import {
  ArgumentsHost,
  HttpException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DomainError, errorBody } from './domain-error';
import { AllExceptionsFilter } from './http-exception.filter';

interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(b: unknown): FakeRes;
}

function run(exception: unknown): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(b) {
      res.body = b;
      return res;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'GET', path: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  void new AllExceptionsFilter().catch(exception, host);
  return res;
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('HttpException com resposta em texto vira objeto { statusCode, message }', () => {
    const res = run(new HttpException('x', 429));
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ statusCode: 429, message: 'x' });
  });

  it('UnauthorizedException mantém o corpo padrão do Nest', () => {
    const res = run(new UnauthorizedException());
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
  });

  it('DomainError usa o status e o errorBody do code', () => {
    const res = run(new DomainError('NOT_FOUND'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual(errorBody('NOT_FOUND'));
  });

  it('erro desconhecido vira 500 fixo sem vazar a message', () => {
    const res = run(new Error('segredo'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno.',
    });
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });
});
