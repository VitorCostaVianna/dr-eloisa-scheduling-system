import { Prisma } from '@prisma/client';

/** ADR 007: a exclusion constraint só aparece como texto em `message` (23P01). */
export function isOverlapViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('no_overlapping_appointments') ||
    err.message.includes('23P01')
  );
}

/** Violação de índice único (P2002) cujo `meta.target` contém `target`. */
export function isUniqueViolation(err: unknown, target: string): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== 'P2002'
  ) {
    return false;
  }
  const t = err.meta?.target;
  return Array.isArray(t) ? t.includes(target) : t === target;
}
