import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Esvazia todas as tabelas do schema public, menos `_prisma_migrations`. A lista vem de
 * pg_tables para não precisar mudar a cada migration. Só interpola nomes lidos do
 * catálogo (sem entrada externa), por isso não usa os métodos Raw "Unsafe" proibidos.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows
    .map((r) => `"${r.tablename.replace(/"/g, '""')}"`)
    .join(', ');
  await prisma.$executeRaw`${Prisma.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)}`;
}
