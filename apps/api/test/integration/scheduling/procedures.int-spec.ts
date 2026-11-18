import { DomainError } from '../../../src/common/errors/domain-error';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ProceduresService } from '../../../src/scheduling/application/procedures.service';
import { createTestApp, type TestApp } from '../../support/app';
import { truncateAll } from '../../support/db';
import { seedProfessional } from '../../support/factories';

describe('[RN-40] ProceduresService — unicidade de nome entre ativos', () => {
  let ctx: TestApp;
  let prisma: PrismaService;
  let service: ProceduresService;
  let professionalId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    service = ctx.app.get(ProceduresService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    ({ professionalId } = await seedProfessional(prisma));
  });

  afterAll(async () => {
    await truncateAll(prisma);
    await ctx.app.close();
  });

  // CA-1.18: … nome repetido entre ativos (sem diferenciar maiúsculas), recusa.
  it('[CA-1.18] criações concorrentes "Canal" e "canal": uma vence, a outra PROCEDURE_NAME_TAKEN', async () => {
    // Quando
    const results = await Promise.allSettled([
      service.create(professionalId, { name: 'Canal', durationMinutes: 60 }),
      service.create(professionalId, { name: 'canal', durationMinutes: 60 }),
    ]);
    // Então
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(DomainError);
    expect((rejected[0].reason as DomainError).code).toBe(
      'PROCEDURE_NAME_TAKEN',
    );
    expect(await prisma.service.count({ where: { active: true } })).toBe(1);
  });
});
