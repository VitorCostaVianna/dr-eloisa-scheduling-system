import {
  addLocalDays,
  daysBetweenInclusive,
  dayOfWeekOf,
  dbDateToLocalDate,
  eachLocalDate,
  instantAt,
  isValidLocalDate,
  localDateOf,
  localDateToDbDate,
  localMinuteOf,
  startOfLocalDay,
} from './clinic-time';

describe('clinic-time', () => {
  describe('instantAt', () => {
    it('converte 08:00 de São Paulo em 11:00Z', () => {
      expect(instantAt('2026-11-09', 480).toISOString()).toBe(
        '2026-11-09T11:00:00.000Z',
      );
    });

    it('minuto 1440 é 00:00 do dia seguinte', () => {
      expect(instantAt('2026-11-20', 1440).toISOString()).toBe(
        '2026-11-21T03:00:00.000Z',
      );
    });

    it('usa os campos locais em dia de troca de horário (New York, 2026-11-01)', () => {
      expect(
        instantAt('2026-11-01', 480, 'America/New_York').toISOString(),
      ).toBe('2026-11-01T13:00:00.000Z');
    });

    it('usa o offset do dia anterior à troca (New York, 2026-10-31)', () => {
      expect(
        instantAt('2026-10-31', 480, 'America/New_York').toISOString(),
      ).toBe('2026-10-31T12:00:00.000Z');
    });
  });

  describe('startOfLocalDay', () => {
    it('é 00:00 local do dia (03:00Z em São Paulo)', () => {
      expect(startOfLocalDay('2026-11-09').toISOString()).toBe(
        '2026-11-09T03:00:00.000Z',
      );
    });
  });

  describe('localDateOf', () => {
    it('23:59 em São Paulo ainda é o dia anterior em UTC', () => {
      expect(localDateOf(new Date(Date.UTC(2026, 10, 10, 2, 59)))).toBe(
        '2026-11-09',
      );
    });
  });

  describe('dayOfWeekOf', () => {
    it('segunda-feira é 1', () => {
      expect(dayOfWeekOf('2026-11-09')).toBe(1);
    });
  });

  describe('addLocalDays', () => {
    it('soma dias cruzando o ano', () => {
      expect(addLocalDays('2026-12-30', 3)).toBe('2027-01-02');
    });
  });

  describe('eachLocalDate', () => {
    it('é inclusivo e cruza o ano', () => {
      expect(eachLocalDate('2026-12-30', '2027-01-02')).toEqual([
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
      ]);
    });
  });

  describe('daysBetweenInclusive', () => {
    it('conta as duas pontas', () => {
      expect(daysBetweenInclusive('2026-11-01', '2026-12-01')).toBe(31);
    });
  });

  describe('isValidLocalDate', () => {
    it('rejeita data inexistente', () => {
      expect(isValidLocalDate('2026-02-30')).toBe(false);
    });

    it('aceita data real', () => {
      expect(isValidLocalDate('2026-02-28')).toBe(true);
    });
  });

  describe('@db.Date', () => {
    it('ida e volta preserva a data', () => {
      expect(dbDateToLocalDate(localDateToDbDate('2026-12-08'))).toBe(
        '2026-12-08',
      );
    });

    it('localDateToDbDate é meia-noite UTC', () => {
      expect(localDateToDbDate('2026-12-08').toISOString()).toBe(
        '2026-12-08T00:00:00.000Z',
      );
    });
  });

  describe('independência de process.env.TZ', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    const run = () => ({
      minute: localMinuteOf(new Date('2026-11-09T11:30:00.000Z')),
      instant: instantAt('2026-11-09', 480).toISOString(),
      date: localDateOf(new Date('2026-11-10T02:59:00.000Z')),
    });

    it('dá o mesmo resultado com TZ=UTC e TZ=Asia/Tokyo', () => {
      process.env.TZ = 'UTC';
      const utc = run();
      process.env.TZ = 'Asia/Tokyo';
      const tokyo = run();

      expect(utc).toEqual({
        minute: 510,
        instant: '2026-11-09T11:00:00.000Z',
        date: '2026-11-09',
      });
      expect(tokyo).toEqual(utc);
    });
  });
});
