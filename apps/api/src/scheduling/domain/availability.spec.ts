import { computeAvailableStarts } from './availability';
import { resolveDurationMinutes } from './procedure-rules';
import { holidaysForDates } from './holidays';
import type { Interval } from './intervals';
import type { LocalDate } from '../../common/time/clinic-time';
import { BASE_NOW, clinicInstant } from '../../../test/support/clock';
import {
  availabilityInput,
  toClinicHHmm,
} from '../../../test/support/availability';

const MON = '2026-11-09';
const TUE = '2026-11-10';
const FRI = '2026-11-13';

/** Roda o motor para um único dia e devolve os inícios em HH:mm da clínica. */
function day(date: LocalDate, o: Parameters<typeof availabilityInput>[0] = {}) {
  const starts = computeAvailableStarts(
    availabilityInput({ fromDate: date, toDate: date, ...o }),
  );
  return (starts.get(date) ?? []).map((d) => toClinicHHmm(d));
}

const MORNING_30_MON = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30'];
const AFTERNOON_30_MON = [
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
];
const AFTERNOON_30_TUE = ['13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
const MONDAY_60 = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
];

describe('[RN-01] grade de 30 em 30 dentro das faixas semanais', () => {
  // CA-1.1: Dado o horário da RN-01 e nenhum agendamento, quando calculo segunda 09/11
  // com 60 min, então os inícios são 08:00 … 10:00, 13:30 … 16:00 (10:30 não, porque
  // cruza o almoço; 16:30 não, porque passa das 17:00).
  it('[CA-1.1] segunda 09/11 com 60 min', () => {
    expect(day(MON, { durationMinutes: 60 })).toEqual(MONDAY_60);
  });

  // CA-1.2: Dado terça 10/11 com 60 min, então a tarde oferece 13:30 a 15:30 (último
  // termina 16:30).
  it('[CA-1.2] terça 10/11 com 60 min: tarde de 13:30 a 15:30', () => {
    const afternoon = day(TUE, { durationMinutes: 60 }).filter(
      (h) => h >= '13:00',
    );
    expect(afternoon).toEqual(['13:30', '14:00', '14:30', '15:00', '15:30']);
  });

  // CA-1.3: Dado sexta 13/11, quando calculo 30 min, então 08:00 … 10:00; com 90 min,
  // 08:00, 08:30, 09:00; nada à tarde.
  it('[CA-1.3] sexta 13/11 com 30 min e com 90 min', () => {
    expect(day(FRI, { durationMinutes: 30 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
    ]);
    expect(day(FRI, { durationMinutes: 90 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
    ]);
  });

  // CA-1.4: Dado 90 min, então segunda oferece 08:00 … 09:30 (termina 11:00), 13:30 a
  // 15:30; terça oferece 08:00 a 09:30 e 13:30 a 15:00.
  it('[CA-1.4] 90 min em segunda e terça', () => {
    expect(day(MON, { durationMinutes: 90 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
    ]);
    expect(day(TUE, { durationMinutes: 90 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
    ]);
  });

  it('toda data do intervalo vira chave do Map, vazia se nada', () => {
    const starts = computeAvailableStarts(
      availabilityInput({ fromDate: '2026-11-13', toDate: '2026-11-16' }),
    );
    expect([...starts.keys()]).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(starts.get('2026-11-14')).toEqual([]);
    expect(starts.get('2026-11-15')).toEqual([]);
  });
});

describe('[RN-02] sábado e domingo sem atendimento', () => {
  // CA-1.7: Dado sábado ou domingo, então nenhum início.
  it('[CA-1.7] sábado 14/11 e domingo 15/11', () => {
    expect(day('2026-11-14')).toEqual([]);
    expect(day('2026-11-15')).toEqual([]);
  });
});

describe('[RN-04] duração padrão', () => {
  // CA-1.6: Dado sem procedimento, então a duração usada é 30 min (RN-04).
  it('[CA-1.6] sem procedimento o motor usa a grade de 30 min', () => {
    const durationMinutes = resolveDurationMinutes(null);
    expect(durationMinutes).toBe(30);
    expect(day(MON, { durationMinutes })).toEqual([
      ...MORNING_30_MON,
      ...AFTERNOON_30_MON,
    ]);
  });
});

describe('[RN-08] feriados nacionais e de BH', () => {
  // CA-1.8: Dado 02/11/2026, 20/11/2026, 25/12/2026, 08/12/2026, 26/03/2027, 27/05/2027
  // e 15/08/2028, então nenhum início nesses dias.
  it.each([
    '2026-11-02',
    '2026-11-20',
    '2026-12-25',
    '2026-12-08',
    '2027-03-26',
    '2027-05-27',
    '2028-08-15',
  ])('[CA-1.8] %s sem nenhum início', (date) => {
    expect(
      day(date, { holidays: holidaysForDates([date]), now: BASE_NOW }),
    ).toEqual([]);
  });
});

describe('[RN-09] Carnaval: segunda e terça sem atendimento, Quarta de Cinzas normal', () => {
  // CA-1.9: Dado 08/02/2027 e 09/02/2027 (segunda e terça de Carnaval), então nenhum
  // início; dado 10/02/2027 (Quarta de Cinzas), horários normais de quarta.
  it('[CA-1.9] 08/02 e 09/02 vazios; 10/02 com a grade de quarta', () => {
    const dates = ['2027-02-08', '2027-02-09', '2027-02-10'];
    const starts = computeAvailableStarts(
      availabilityInput({
        fromDate: '2027-02-08',
        toDate: '2027-02-10',
        holidays: holidaysForDates(dates),
      }),
    );
    const hhmm = (d: string) =>
      (starts.get(d) ?? []).map((s) => toClinicHHmm(s));
    expect(hhmm('2027-02-08')).toEqual([]);
    expect(hhmm('2027-02-09')).toEqual([]);
    expect(hhmm('2027-02-10')).toEqual([
      ...MORNING_30_MON,
      ...AFTERNOON_30_MON,
    ]);
  });
});

describe('[RN-13] agendamentos ocupantes', () => {
  // CA-1.11: Dado um agendamento ocupante 09:00–10:00 na segunda, quando calculo 60 min,
  // então 08:30 e 09:00 e 09:30 não aparecem, 08:00 e 10:00 aparecem.
  it('[CA-1.11] ocupado 09:00–10:00, 60 min', () => {
    const occupied: Interval[] = [
      {
        start: clinicInstant('2026-11-09 09:00'),
        end: clinicInstant('2026-11-09 10:00'),
      },
    ];
    expect(day(MON, { occupied, durationMinutes: 60 })).toEqual([
      '08:00',
      '10:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
    ]);
  });

  // CA-1.12: Dado um agendamento ocupante 09:00–09:45 (fora da grade), quando calculo
  // 30 min, então 09:00 e 09:30 não aparecem, 10:00 aparece.
  it('[CA-1.12] ocupado 09:00–09:45, 30 min', () => {
    const occupied: Interval[] = [
      {
        start: clinicInstant('2026-11-09 09:00'),
        end: clinicInstant('2026-11-09 09:45'),
      },
    ];
    const morning = day(MON, { occupied, durationMinutes: 30 }).filter(
      (h) => h < '12:00',
    );
    expect(morning).toEqual(['08:00', '08:30', '10:00', '10:30']);
  });
});

describe('[RN-42] bloqueios de agenda', () => {
  // CA-1.14: Dado um bloqueio na segunda 13:30–24:00, então só a manhã de segunda
  // aparece (60 min).
  it('[CA-1.14] bloqueio 13:30–24:00 deixa só a manhã', () => {
    const blocks: Interval[] = [
      {
        start: clinicInstant('2026-11-09 13:30'),
        end: clinicInstant('2026-11-10 00:00'),
      },
    ];
    expect(day(MON, { blocks, durationMinutes: 60 })).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
    ]);
  });

  // CA-1.14: Dado um bloqueio de 09:15 a 09:45, quando calculo 30 min, então 09:00 e
  // 09:30 somem.
  it('[CA-1.14] bloqueio 09:15–09:45, 30 min', () => {
    const blocks: Interval[] = [
      {
        start: clinicInstant('2026-11-09 09:15'),
        end: clinicInstant('2026-11-09 09:45'),
      },
    ];
    const morning = day(MON, { blocks, durationMinutes: 30 }).filter(
      (h) => h < '12:00',
    );
    expect(morning).toEqual(['08:00', '08:30', '10:00', '10:30']);
  });

  // Sem tag (foco da revisão, item 5): bloqueio que atravessa a meia-noite.
  it('bloqueio de segunda 16:00 a terça 09:00 corta as duas pontas', () => {
    const blocks: Interval[] = [
      {
        start: clinicInstant('2026-11-09 16:00'),
        end: clinicInstant('2026-11-10 09:00'),
      },
    ];
    const starts = computeAvailableStarts(
      availabilityInput({
        fromDate: MON,
        toDate: TUE,
        blocks,
        durationMinutes: 30,
      }),
    );
    const hhmm = (d: string) =>
      (starts.get(d) ?? []).map((s) => toClinicHHmm(s));
    expect(hhmm(MON)).toEqual([
      ...MORNING_30_MON,
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
    ]);
    expect(hhmm(TUE)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      ...AFTERNOON_30_TUE,
    ]);
  });
});

describe('[RN-07] não oferecer horário no passado', () => {
  // CA-1.16: Dado "agora" = segunda 09/11 09:10, quando calculo a própria segunda,
  // então 08:00–09:00 não aparecem e 09:30 aparece.
  it('[CA-1.16] agora = 09/11 09:10, 30 min', () => {
    expect(
      day(MON, { now: clinicInstant('2026-11-09 09:10'), durationMinutes: 30 }),
    ).toEqual(['09:30', '10:00', '10:30', ...AFTERNOON_30_MON]);
  });
});

describe('[RN-46] desbloqueio de feriado', () => {
  const HOLIDAY = '2026-12-08';
  const holidays = holidaysForDates([HOLIDAY]);

  // CA-1.23: Dado 08/12/2026 (feriado, terça), quando a dentista desbloqueia esse dia,
  // então a disponibilidade de 08/12 é a de uma terça normal (RN-01).
  it('[CA-1.23] feriado desbloqueado tem a grade normal de terça', () => {
    expect(
      day(HOLIDAY, { holidays, holidayOverrides: new Set([HOLIDAY]) }),
    ).toEqual([...MORNING_30_MON, ...AFTERNOON_30_TUE]);
  });

  // CA-1.24: Dado 08/12/2026 desbloqueado e um bloqueio 13:30–16:30 nesse dia, então só
  // a manhã aparece (desbloqueio não anula bloqueio).
  it('[CA-1.24] desbloqueio não anula bloqueio 13:30–16:30', () => {
    const blocks: Interval[] = [
      {
        start: clinicInstant('2026-12-08 13:30'),
        end: clinicInstant('2026-12-08 16:30'),
      },
    ];
    expect(
      day(HOLIDAY, {
        holidays,
        holidayOverrides: new Set([HOLIDAY]),
        blocks,
      }),
    ).toEqual(MORNING_30_MON);
  });
});

describe('[RN-01] independência do fuso do processo', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  // CA-1.17: Dado o mesmo cálculo rodando com TZ do processo em UTC e em
  // America/Sao_Paulo, então o resultado é idêntico.
  it('[CA-1.17] TZ=UTC e TZ=America/Sao_Paulo dão o mesmo resultado', () => {
    const run = () =>
      [
        ...computeAvailableStarts(
          availabilityInput({
            fromDate: MON,
            toDate: FRI,
            durationMinutes: 60,
            blocks: [
              {
                start: clinicInstant('2026-11-10 09:00'),
                end: clinicInstant('2026-11-10 10:00'),
              },
            ],
          }),
        ),
      ].map(([d, list]) => [d, list.map((s) => s.toISOString())]);

    process.env.TZ = 'UTC';
    const inUtc = run();
    process.env.TZ = 'America/Sao_Paulo';
    const inSaoPaulo = run();

    expect(inUtc.flatMap(([, l]) => l).length).toBeGreaterThan(0);
    expect(inSaoPaulo).toEqual(inUtc);
  });

  // CA-1.17: Dado o fuso de teste com horário de verão (America/New_York no dia da
  // troca), então a grade continua correta em horário local.
  it('[CA-1.17] America/New_York na troca de horário de verão (01/11/2026)', () => {
    const tz = 'America/New_York';
    const everyDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: 480,
      endMinute: 540,
    }));
    const starts = computeAvailableStarts(
      availabilityInput({
        fromDate: '2026-10-31',
        toDate: '2026-11-02',
        weeklyHours: everyDay,
        timeZone: tz,
        durationMinutes: 30,
        now: clinicInstant('2026-10-30 00:00', tz),
      }),
    );
    const local = (d: string) =>
      (starts.get(d) ?? []).map((s) => toClinicHHmm(s, tz));
    const iso = (d: string) =>
      (starts.get(d) ?? []).map((s) => s.toISOString());

    expect(local('2026-10-31')).toEqual(['08:00', '08:30']);
    expect(local('2026-11-01')).toEqual(['08:00', '08:30']);
    expect(local('2026-11-02')).toEqual(['08:00', '08:30']);
    expect(iso('2026-10-31')).toEqual([
      '2026-10-31T12:00:00.000Z',
      '2026-10-31T12:30:00.000Z',
    ]);
    expect(iso('2026-11-01')).toEqual([
      '2026-11-01T13:00:00.000Z',
      '2026-11-01T13:30:00.000Z',
    ]);
    expect(iso('2026-11-02')).toEqual([
      '2026-11-02T13:00:00.000Z',
      '2026-11-02T13:30:00.000Z',
    ]);
  });
});
