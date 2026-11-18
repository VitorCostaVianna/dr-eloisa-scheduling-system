import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_STATUS } from './error-codes';
import { DomainError, errorBody } from './domain-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();

    if (exception instanceof DomainError) {
      res
        .status(ERROR_STATUS[exception.code])
        .json(errorBody(exception.code, exception.details));
      return;
    }

    // Guard (401), throttler (429), rota inexistente (404): resposta padrão do Nest.
    if (exception instanceof HttpException) {
      // Mesmo formato do filtro padrão do Nest: resposta em texto (ex.: throttler) vira objeto.
      const status = exception.getStatus();
      const body = exception.getResponse();
      res
        .status(status)
        .json(
          typeof body === 'object'
            ? body
            : { statusCode: status, message: body },
        );
      return;
    }

    // Só o nome e a rota: a message (ex.: erro do Prisma) pode conter valores digitados.
    const req = http.getRequest<Request>();
    const name = exception instanceof Error ? exception.name : 'UnknownError';
    this.logger.error(`${name} em ${req.method} ${req.path}`);
    res.status(500).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno.',
    });
  }
}
