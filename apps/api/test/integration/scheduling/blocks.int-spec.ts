import { DomainError } from '../../../src/common/errors/domain-error';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ScheduleConfigService } from '../../../src/scheduling/application/schedule-config.service';
import { createTestApp, type TestApp } from '../../support/app';
import { clinicInstant } from '../../support/clock';
import { truncateAll } from '../../support/db';
import { seedProfessional } from '../../support/factories';

describe('[RN-42] bloqueio de dia inteiro', () => {
  let ctx: TestApp;
  let prisma: PrismaService;
  let service: ScheduleConfigService;
  let professionalId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    service = ctx.app.get(ScheduleConfigService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    ({ professionalId } = await seedProfessional(prisma));
  });

  afterAll(async () => {
    await truncateAll(prisma);
    await ctx.app.close();
  });

  // CA-1.15: Dado um bloqueio de dia inteiro de 16/11 a 20/11, então nenhum início nesses
  // dias é oferecido. (A parte "nenhum início" fica no e2e da Tarefa 12; aqui, a linha gravada.)
  it('[CA-1.15] FULL_DAYS 16/11..20/11 grava [16/11 00:00, 21/11 00:00) no fuso da clínica', async () => {
    // Dado
    expect(await prisma.scheduleBlock.count()).toBe(0);
    // Quando
    const created = await service.createBlock(professionalId, {
      kind: 'FULL_DAYS',
      fromDate: '2026-11-16',
      toDate: '2026-11-20',
    });
    // Então: a linha no banco, não só o retorno
    const rows = await prisma.scheduleBlock.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].professionalId).toBe(professionalId);
    expect(rows[0].startAt).toEqual(clinicInstant('2026-11-16 00:00'));
    expect(rows[0].endAt).toEqual(clinicInstant('2026-11-21 00:00'));
    expect(rows[0].reason).toBeNull();
    expect(created.startAt).toEqual(clinicInstant('2026-11-16 00:00'));
    expect(created.endAt).toEqual(clinicInstant('2026-11-21 00:00'));
  });

  describe('intervalo invertido recusado no caso de uso (nunca erro do CHECK do banco)', () => {
    it('FULL_DAYS com toDate < fromDate → VALIDATION_FAILED e nada gravado', async () => {
      // Dado
      const before = await prisma.scheduleBlock.count();
      // Quando
      const attempt = service.createBlock(professionalId, {
        kind: 'FULL_DAYS',
        fromDate: '2026-11-20',
        toDate: '2026-11-16',
      });
      // Então
      await expect(attempt).rejects.toBeInstanceOf(DomainError);
      await expect(attempt).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(before).toBe(0);
      expect(await prisma.scheduleBlock.count()).toBe(before);
    });

    it('PERIOD com endAt = startAt → VALIDATION_FAILED, sem o motivo em details, e nada gravado', async () => {
      const before = await prisma.scheduleBlock.count();
      const at = clinicInstant('2026-11-09 10:00').toISOString();
      const attempt = service.createBlock(professionalId, {
        kind: 'PERIOD',
        startAt: at,
        endAt: at,
        reason: 'MOTIVO-SECRETO',
      });
      await expect(attempt).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      // details só com nomes de campo, nunca o motivo
      const err = (await attempt.catch((e: unknown) => e)) as DomainError;
      expect(JSON.stringify(err.details ?? {})).not.toContain('MOTIVO-SECRETO');
      expect(before).toBe(0);
      expect(await prisma.scheduleBlock.count()).toBe(before);
    });
  });
});
