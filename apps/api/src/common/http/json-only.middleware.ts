import type { NextFunction, Request, Response } from 'express';
import { errorBody } from '../errors/domain-error';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// CSRF por Content-Type (spec 10.1): form/multipart/text-plain são os únicos tipos que um
// formulário cross-site consegue enviar sem preflight; mutação só aceita JSON. Sem corpo e
// sem Content-Type (ex.: /auth/refresh) segue.
export function jsonOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers['content-type'];
  if (MUTATING.has(req.method) && header !== undefined) {
    const mediaType = header.split(';')[0].replace(/\s/g, '').toLowerCase();
    if (mediaType !== 'application/json') {
      res.status(415).json(errorBody('UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
  }
  next();
}
