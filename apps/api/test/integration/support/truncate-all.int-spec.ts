import { PrismaClient } from '@prisma/client';
import { truncateAll } from '../../support/db';

describe('truncateAll', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('esvazia as tabelas e preserva _prisma_migrations', async () => {
    // Dado um usuário inserido
    await prisma.user.create({
      data: { email: 'truncate@example.com', passwordHash: 'x' },
    });
    expect(await prisma.user.count()).toBe(1);
    // Quando
    await truncateAll(prisma);
    // Então
    expect(await prisma.user.count()).toBe(0);
    const [{ n }] = await prisma.$queryRaw<
      { n: number }[]
    >`SELECT COUNT(*)::int AS n FROM _prisma_migrations`;
    expect(n).toBeGreaterThan(0);
  });
});
