import type { Prisma } from '@prisma/client';

/**
 * Serializa escritas na agenda de uma profissional (arquitetura 2.8).
 * Deve ser a primeira instrução da transação; o lock cai no commit/rollback.
 * `$executeRaw` (não `$queryRaw`): a função devolve void, que o Prisma pode não desserializar.
 */
export async function lockSchedule(
  tx: Prisma.TransactionClient,
  professionalId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('schedule:' || ${professionalId}, 0))`;
}
