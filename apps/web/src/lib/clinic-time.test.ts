// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  clinicLocalToIso,
  formatClinicDate,
  formatClinicTime,
  localDateOf,
  localMinuteOf,
  todayInClinic,
  weekStartOf,
} from './clinic-time';

// Camada W. O resultado não pode depender do fuso do processo (guia §7.1): o conjunto roda uma
// vez por TZ. Atribuir process.env.TZ faz o Node reler o fuso na hora; o beforeEach confere
// (via Date#getTimezoneOffset) que a troca de fato valeu e o afterEach restaura (guia §7.5).
describe.each(['America/Sao_Paulo', 'UTC', 'Asia/Tokyo'])(
  '[W] clinic-time com TZ do processo = %s',
  (processTz) => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = processTz;
      const offsetMin = new Date('2026-11-09T12:00:00.000Z').getTimezoneOffset();
      const expected = { 'America/Sao_Paulo': 180, UTC: 0, 'Asia/Tokyo': -540 }[processTz];
      // Garante que o teste prova o que diz: o fuso do processo realmente mudou.
      expect(offsetMin).toBe(expected);
    });

    afterEach(() => {
      vi.useRealTimers();
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    describe('localDateOf', () => {
      it('[W] 02:59Z de 10/11 ainda é 09/11 em Brasília', () => {
        // Dado um instante UTC logo antes da meia-noite local
        const instant = '2026-11-10T02:59:00.000Z';
        // Quando / Então
        expect(localDateOf(instant)).toBe('2026-11-09');
      });

      it('[W] 03:00Z de 10/11 já é 10/11 (meia-noite local, semiaberto)', () => {
        expect(localDateOf('2026-11-10T03:00:00.000Z')).toBe('2026-11-10');
      });
    });

    describe('localMinuteOf', () => {
      it('[W] 11:00Z é 08:00 local = 480 minutos', () => {
        expect(localMinuteOf('2026-11-09T11:00:00.000Z')).toBe(480);
      });

      it('[W] 03:00Z é 00:00 local = 0 e 02:59Z é 23:59 local = 1439', () => {
        expect(localMinuteOf('2026-11-10T03:00:00.000Z')).toBe(0);
        expect(localMinuteOf('2026-11-10T02:59:00.000Z')).toBe(1439);
      });
    });

    describe('formatClinicTime', () => {
      it('[W] 11:00Z em Brasília é 08:00', () => {
        expect(formatClinicTime('2026-11-09T11:00:00.000Z')).toBe('08:00');
      });

      it('[W] 02:59Z do dia seguinte é 23:59', () => {
        expect(formatClinicTime('2026-11-10T02:59:00.000Z')).toBe('23:59');
      });
    });

    describe('formatClinicDate', () => {
      it('[W] 2026-11-09 é "segunda-feira, 9 de novembro"', () => {
        expect(formatClinicDate('2026-11-09')).toBe('segunda-feira, 9 de novembro');
      });

      it('[W] 2026-12-25 é "sexta-feira, 25 de dezembro"', () => {
        expect(formatClinicDate('2026-12-25')).toBe('sexta-feira, 25 de dezembro');
      });
    });

    describe('weekStartOf', () => {
      it('[W] quinta 12/11 -> segunda 09/11', () => {
        expect(weekStartOf('2026-11-12')).toBe('2026-11-09');
      });

      it('[W] segunda devolve ela mesma e domingo devolve a segunda anterior', () => {
        expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
        expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
      });

      it('[W] semana que cruza o ano: quinta 01/01/2026 -> segunda 29/12/2025', () => {
        expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
      });
    });

    describe('addDays', () => {
      it('[W] soma dentro do mês', () => {
        expect(addDays('2026-11-09', 7)).toBe('2026-11-16');
      });

      it('[W] vira o mês: 28/11 + 3 = 01/12', () => {
        expect(addDays('2026-11-28', 3)).toBe('2026-12-01');
      });

      it('[W] vira o ano: 30/12 + 2 = 01/01', () => {
        expect(addDays('2026-12-30', 2)).toBe('2027-01-01');
      });

      it('[W] subtrai com n negativo e n = 0 não muda', () => {
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2026-11-09', 0)).toBe('2026-11-09');
      });
    });

    describe('todayInClinic', () => {
      it('[W] 02:30Z de 10/11 (23:30 em Brasília) ainda é 09/11', () => {
        // Dado o relógio falso em 2026-11-10T02:30Z
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-10T02:30:00.000Z'));
        // Então
        expect(todayInClinic()).toBe('2026-11-09');
      });

      it('[W] 03:30Z de 10/11 (00:30 em Brasília) já é 10/11', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-10T03:30:00.000Z'));
        expect(todayInClinic()).toBe('2026-11-10');
      });
    });

    describe('clinicLocalToIso', () => {
      it('[W] 09/11 09:15 em Brasília é 12:15Z', () => {
        expect(clinicLocalToIso('2026-11-09', '09:15')).toBe('2026-11-09T12:15:00.000Z');
      });

      it('[W] 09/11 09:45 em Brasília é 12:45Z', () => {
        expect(clinicLocalToIso('2026-11-09', '09:45')).toBe('2026-11-09T12:45:00.000Z');
      });

      it('[W] 23:30 local cai no dia seguinte em UTC', () => {
        expect(clinicLocalToIso('2026-11-09', '23:30')).toBe('2026-11-10T02:30:00.000Z');
      });

      it('[W] 00:00 local é 03:00Z do mesmo dia', () => {
        expect(clinicLocalToIso('2026-11-09', '00:00')).toBe('2026-11-09T03:00:00.000Z');
      });

      it('[W] é o inverso de localDateOf/formatClinicTime', () => {
        const iso = clinicLocalToIso('2026-12-08', '13:30');
        expect(localDateOf(iso)).toBe('2026-12-08');
        expect(formatClinicTime(iso)).toBe('13:30');
      });

      it('[W] data ou hora inválida lança', () => {
        expect(() => clinicLocalToIso('2026-13-40', '09:15')).toThrow();
        expect(() => clinicLocalToIso('2026-11-09', '25:00')).toThrow();
      });
    });
  },
);
