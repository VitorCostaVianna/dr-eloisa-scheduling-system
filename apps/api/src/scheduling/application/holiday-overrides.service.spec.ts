import { Logger } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import type { PrismaService } from '../../prisma/prisma.service';
import { clinicHolidays } from '../domain/holidays';
import type { HolidayOverrideRepository } from '../infra/holiday-override.repository';
import { HolidayOverridesService } from './holiday-overrides.service';

describe('HolidayOverridesService', () => {
  const professionalId = 'prof-1';
  const tx = { $executeRaw: jest.fn() };
  let repo: {
    findInRange: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock };
  let service: HolidayOverridesService;
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    tx.$executeRaw.mockReset().mockResolvedValue(0);
    repo = {
      findInRange: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      delete: jest.fn().mockResolvedValue(0),
    };
    prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    service = new HolidayOverridesService(
      repo as unknown as HolidayOverrideRepository,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('listHolidays', () => {
    it('lista os feriados do ano por data, marcando os desbloqueados', async () => {
      repo.findInRange.mockResolvedValue([{ id: 'o1', date: '2026-12-08' }]);

      const result = await service.listHolidays(professionalId, 2026);

      expect(repo.findInRange).toHaveBeenCalledWith(
        professionalId,
        '2026-01-01',
        '2026-12-31',
      );
      const dates = result.map((h) => h.date);
      expect(dates).toEqual([...clinicHolidays(2026).keys()].sort());
      expect(result.filter((h) => h.overridden).map((h) => h.date)).toEqual([
        '2026-12-08',
      ]);
      expect(result.find((h) => h.date === '2026-12-25')).toEqual({
        date: '2026-12-25',
        name: 'Natal',
        overridden: false,
      });
    });
  });

  describe('override', () => {
    it('data que não é feriado → NOT_A_HOLIDAY, sem gravar', async () => {
      await expect(
        service.override(professionalId, '2026-11-10'),
      ).rejects.toEqual(new DomainError('NOT_A_HOLIDAY'));
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('feriado móvel (Carnaval 2027) é aceito pelo ano da própria data', async () => {
      repo.upsert.mockResolvedValue({ id: 'o1', date: '2027-02-08' });

      await expect(
        service.override(professionalId, '2027-02-08'),
      ).resolves.toEqual({ id: 'o1', date: '2027-02-08' });
      expect(repo.upsert).toHaveBeenCalledWith(professionalId, '2027-02-08');
    });
  });

  describe('undoOverride', () => {
    it('toma o lock antes de apagar, na mesma transação', async () => {
      const order: string[] = [];
      tx.$executeRaw.mockImplementation(() => {
        order.push('lock');
        return Promise.resolve(0);
      });
      repo.delete.mockImplementation(() => {
        order.push('delete');
        return Promise.resolve(1);
      });

      await service.undoOverride(professionalId, '2026-12-08');

      expect(order).toEqual(['lock', 'delete']);
      expect(repo.delete).toHaveBeenCalledWith(
        tx,
        professionalId,
        '2026-12-08',
      );
    });

    it('sem linha para apagar também resolve (idempotente) e não registra log', async () => {
      await expect(
        service.undoOverride(professionalId, '2026-12-08'),
      ).resolves.toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    });

    it('registra holiday_override.deleted só com a data quando apagou a linha', async () => {
      repo.delete.mockResolvedValue(1);

      await service.undoOverride(professionalId, '2026-12-08');

      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith({
        event: 'holiday_override.deleted',
        date: '2026-12-08',
      });
    });
  });
});
