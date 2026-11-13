import request from 'supertest';
import type { AvailabilityResponse } from '@sistema-agendamento/shared-types';
import { CLINIC_TIME_ZONE } from '../../../src/common/time/clinic-time';
import { createTestApp, loginAsDentist, type TestApp } from '../../support/app';
import { clinicInstant } from '../../support/clock';
import { truncateAll } from '../../support/db';
import {
  makeAppointment,
  makeBlock,
  makeService,
  seedProfessional,
} from '../../support/factories';

// Relógio: BASE_NOW = domingo 01/11/2026 12:00 (clínica); todas as datas abaixo são futuras.
describe('Disponibilidade pública (e2e)', () => {
  let ctx: TestApp;
  let professionalId: string;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    ({ professionalId } = await seedProfessional(ctx.prisma));
    // Um login só: POST /auth/login limita a 5 por minuto (429).
    cookie = await loginAsDentist(ctx.app);
  });

  beforeEach(async () => {
    // Não usa truncateAll: apagaria o usuário do cookie.
    await ctx.prisma.appointment.deleteMany();
    await ctx.prisma.patient.deleteMany();
    await ctx.prisma.service.deleteMany();
    await ctx.prisma.scheduleBlock.deleteMany();
    await ctx.prisma.holidayOverride.deleteMany();
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const availability = (query: string) =>
    http().get(`/public/availability${query}`);
  /** Inícios esperados de um dia, em ISO UTC (como a API devolve). */
  const isoStarts = (date: string, ...hhmm: string[]) =>
    hhmm.map((t) => clinicInstant(`${date} ${t}`).toISOString());

  // RN-01 + RN-02 com 30 min: segunda 08:00–11:00 e 13:30–17:00; terça 13:30–16:30.
  const MONDAY_30 = [
    '08:00',
    '08:30',
    '09:00',
    '09:30',
    '10:00',
    '10:30',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
  ];
  const TUESDAY_30 = [
    '08:00',
    '08:30',
    '09:00',
    '09:30',
    '10:00',
    '10:30',
    '13:30',
    '14:00',
    '14:30',
    '15:00',
    '15:30',
    '16:00',
  ];

  describe('[RN-04] sem procedimento = 30 min', () => {
    // CA-1.6: Dado sem procedimento, então a duração usada é 30 min (RN-04).
    it('[CA-1.6] segunda 09/11 sem serviceId → durationMinutes 30 e grade de 30 min', async () => {
      // Quando
      const res = await availability('?from=2026-11-09&to=2026-11-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timeZone: CLINIC_TIME_ZONE,
        durationMinutes: 30,
        days: [
          { date: '2026-11-09', starts: isoStarts('2026-11-09', ...MONDAY_30) },
        ],
      });
    });

    it('com serviceId de 60 min → durationMinutes 60 e inícios do CA-1.1', async () => {
      // Dado
      const service = await makeService(ctx.prisma, {
        professionalId,
        durationMinutes: 60,
      });
      // Quando
      const res = await availability(
        `?from=2026-11-09&to=2026-11-09&serviceId=${service.id}`,
      );
      // Então
      expect(res.status).toBe(200);
      expect(res.body.durationMinutes).toBe(60);
      expect(res.body.days).toEqual([
        {
          date: '2026-11-09',
          starts: isoStarts(
            '2026-11-09',
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
          ),
        },
      ]);
    });
  });

  describe('[RN-08] feriados bloqueados', () => {
    // CA-1.8: Dado 02/11/2026 (Finados, segunda), 20/11/2026 (Consciência Negra, sexta),
    // 25/12/2026 (sexta), 08/12/2026 (Imaculada Conceição, BH, terça), 26/03/2027
    // (Sexta-feira Santa), 27/05/2027 (Corpus Christi, quinta) e 15/08/2028 (Assunção, BH,
    // terça), então nenhum início nesses dias, e o painel mostra cada um como feriado com o
    // nome. (Parte do painel em calendar.e2e-spec.ts.)
    it.each([
      '2026-11-02',
      '2026-11-20',
      '2026-12-25',
      '2026-12-08',
      '2027-03-26',
      '2027-05-27',
      '2028-08-15',
    ])('[CA-1.8] %s → starts: []', async (date) => {
      // Quando
      const res = await availability(`?from=${date}&to=${date}`);
      // Então
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timeZone: CLINIC_TIME_ZONE,
        durationMinutes: 30,
        days: [{ date, starts: [] }],
      });
    });

    // Foco da revisão, item 1: a janela cruza o ano; os feriados de 2027 também entram.
    it('janela 28/12/2026..03/01/2027 → 01/01/2027 sem inícios; 28/12 (segunda) normal', async () => {
      // Quando
      const res = await availability('?from=2026-12-28&to=2027-01-03');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.days.map((d: { date: string }) => d.date)).toEqual([
        '2026-12-28',
        '2026-12-29',
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02',
        '2027-01-03',
      ]);
      const body = res.body as AvailabilityResponse;
      const byDate = new Map(body.days.map((d) => [d.date, d.starts]));
      expect(byDate.get('2027-01-01')).toEqual([]);
      expect(byDate.get('2026-12-28')).toEqual(
        isoStarts('2026-12-28', ...MONDAY_30),
      );
    });
  });

  describe('[RN-42] bloqueio de dia inteiro', () => {
    // CA-1.15: Dado um bloqueio de dia inteiro de 16/11 a 20/11, então nenhum início nesses
    // dias, e o bloqueio começa 00:00 de 16/11 e termina 00:00 de 21/11 no fuso da clínica
    // (03:00Z), conferido no banco. (Gravação conferida em blocks.e2e e no int.)
    it('[CA-1.15] FULL_DAYS 16/11..20/11 via POST /blocks → os 5 dias com starts: []', async () => {
      // Dado
      const created = await http().post('/blocks').set('Cookie', cookie).send({
        kind: 'FULL_DAYS',
        fromDate: '2026-11-16',
        toDate: '2026-11-20',
      });
      expect(created.status).toBe(201);
      // Quando
      const res = await availability('?from=2026-11-16&to=2026-11-20');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.days).toEqual([
        { date: '2026-11-16', starts: [] },
        { date: '2026-11-17', starts: [] },
        { date: '2026-11-18', starts: [] },
        { date: '2026-11-19', starts: [] },
        { date: '2026-11-20', starts: [] },
      ]);
    });
  });

  describe('[RN-46] desbloqueio de feriado', () => {
    // CA-1.23: Dado 08/12/2026 (feriado, terça), quando a dentista desbloqueia esse dia,
    // então a disponibilidade pública de 08/12 é a de uma terça normal (RN-01), e o painel
    // mostra o dia como "feriado — atendendo". (Parte do painel em calendar.e2e-spec.ts.)
    it('[CA-1.23] 08/12 desbloqueado → inícios de terça normal', async () => {
      // Dado
      const override = await http()
        .post('/holiday-overrides')
        .set('Cookie', cookie)
        .send({ date: '2026-12-08' });
      expect(override.status).toBe(201);
      // Quando
      const res = await availability('?from=2026-12-08&to=2026-12-08');
      // Então
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timeZone: CLINIC_TIME_ZONE,
        durationMinutes: 30,
        days: [
          {
            date: '2026-12-08',
            starts: isoStarts('2026-12-08', ...TUESDAY_30),
          },
        ],
      });
    });
  });

  // CA-1.21 não cita RN: o limite de 31 dias é decisão de design da spec §7.
  describe('[API] spec §7 — janela da disponibilidade (máx. 31 dias)', () => {
    // CA-1.21: Dado um pedido de disponibilidade com intervalo > 31 dias ou datas
    // inválidas, então 400.
    it.each([
      ['32 dias (01/11..02/12)', '?from=2026-11-01&to=2026-12-02'],
      ['to < from', '?from=2026-11-10&to=2026-11-09'],
      ['data inexistente 2026-02-30', '?from=2026-02-30&to=2026-03-02'],
      ['from=abc', '?from=abc&to=2026-11-09'],
      ['sem to', '?from=2026-11-09'],
    ])('[CA-1.21] %s → 400 VALIDATION_FAILED', async (_name, query) => {
      // Quando
      const res = await availability(query);
      // Então
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    // Fronteira: 31 dias é o máximo permitido, não o primeiro recusado.
    it('31 dias (01/11..01/12) → 200 com 31 dias', async () => {
      const res = await availability('?from=2026-11-01&to=2026-12-01');
      expect(res.status).toBe(200);
      expect(res.body.days).toHaveLength(31);
      expect(res.body.days[0].date).toBe('2026-11-01');
      expect(res.body.days[30].date).toBe('2026-12-01');
    });

    // Re-revisão I-1: limites de ano da borda (IsLocalDate) são 1..9998. Fora → 400;
    // dentro → 200, nunca 500 (os casos de uso somam/subtraem 1 dia nas bordas).
    it.each([['0000-01-01'], ['9999-01-01']])(
      'from=to=%s (fora dos anos 1..9998) → 400 VALIDATION_FAILED',
      async (date) => {
        const res = await availability(`?from=${date}&to=${date}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      },
    );

    it.each([['0001-01-01'], ['9998-12-31']])(
      'from=to=%s (borda dos anos aceitos) → 200 com o dia',
      async (date) => {
        const res = await availability(`?from=${date}&to=${date}`);
        expect(res.status).toBe(200);
        expect(res.body.days).toHaveLength(1);
        expect(res.body.days[0].date).toBe(date);
      },
    );
  });

  // Foco da revisão, item 4: serviceId que não pode ser usado → 422, não 404 nem 200.
  describe('[RN-40] procedimento inativo ou de fora não serve para disponibilidade', () => {
    it('serviceId de procedimento desativado → 422 PROCEDURE_INACTIVE', async () => {
      // Dado
      const service = await makeService(ctx.prisma, {
        professionalId,
        active: false,
      });
      // Quando
      const res = await availability(
        `?from=2026-11-09&to=2026-11-09&serviceId=${service.id}`,
      );
      // Então
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROCEDURE_INACTIVE');
    });

    it('serviceId UUID inexistente → 422 PROCEDURE_INACTIVE', async () => {
      const res = await availability(
        '?from=2026-11-09&to=2026-11-09&serviceId=6f1c2a1e-6c1b-4c6e-9a43-2d4f0b7e9a10',
      );
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROCEDURE_INACTIVE');
    });

    it('serviceId ativo, mas não ligado a esta profissional → 422 PROCEDURE_INACTIVE', async () => {
      // Dado: procedimento sem a relação com a profissional
      const orphan = await ctx.prisma.service.create({
        data: { name: 'Sem profissional', durationMinutes: 30, active: true },
        select: { id: true },
      });
      // Quando
      const res = await availability(
        `?from=2026-11-09&to=2026-11-09&serviceId=${orphan.id}`,
      );
      // Então
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROCEDURE_INACTIVE');
    });
  });

  // Revisão da Tarefa 12, Minor 3: ocupante que começa ANTES da janela e invade o
  // primeiro horário dela. Como RN-05 limita a 90 min, só uma faixa que começa à meia-noite
  // é alcançável; a faixa 00:00–02:00 de terça é criada só neste teste e apagada no fim.
  describe('[RN-13] ocupante que começa antes da janela', () => {
    it('09/11 23:30–10/11 00:30, janela só 10/11 com faixa extra 00:00–02:00 → sem o início 00:00', async () => {
      // Dado: terça com faixa extra 00:00–02:00 além da RN-01
      const extra = await ctx.prisma.workingHours.create({
        data: {
          professionalId,
          dayOfWeek: 2,
          startMinute: 0,
          endMinute: 120,
        },
        select: { id: true },
      });
      try {
        // Dado: CONFIRMED de 60 min que começa na segunda 09/11 e entra na terça 10/11
        await makeAppointment(ctx.prisma, {
          professionalId,
          startAt: clinicInstant('2026-11-09 23:30'),
          durationMinutes: 60,
          status: 'CONFIRMED',
        });
        // Quando
        const res = await availability('?from=2026-11-10&to=2026-11-10');
        // Então: 00:00 colide com [23:30, 00:30); 00:30 em diante segue livre
        expect(res.status).toBe(200);
        expect(res.body.days).toEqual([
          {
            date: '2026-11-10',
            starts: isoStarts(
              '2026-11-10',
              '00:30',
              '01:00',
              '01:30',
              ...TUESDAY_30,
            ),
          },
        ]);
      } finally {
        await ctx.prisma.workingHours.delete({ where: { id: extra.id } });
      }
    });
  });

  // Revisão da Tarefa 12, Minor 6: guia §6 pede 60/min na disponibilidade pública. App
  // própria (ThrottlerStorage em memória, nova a cada app) para o contador não vazar para
  // os outros testes deste arquivo, que também chamam a rota.
  describe('[SEGURANÇA] guia §6 — limite de 60 req/min na rota pública', () => {
    let throttled: TestApp;

    beforeAll(async () => {
      throttled = await createTestApp();
    });

    afterAll(async () => {
      await throttled.app.close();
    });

    it('60 requisições → 200; a 61ª → 429', async () => {
      // Dado: app nova, contador zerado; mesmo cliente nas 61 chamadas
      const call = () =>
        request(throttled.app.getHttpServer()).get(
          '/public/availability?from=2026-11-09&to=2026-11-09',
        );
      const statuses: number[] = [];
      // Quando: em sequência, para a ordem das chamadas ser a ordem do contador
      for (let i = 0; i < 61; i++) statuses.push((await call()).status);
      // Então
      expect(statuses.slice(0, 60)).toEqual(Array<number>(60).fill(200));
      expect(statuses[60]).toBe(429);
    });
  });

  // CA-3.25 não cita RN: a regra é a spec 10.3 (mesmo padrão do '[CSRF] spec 10.1').
  describe('[PRIVACIDADE] spec 10.3 — resposta pública não revela ocupação', () => {
    // CA-3.25: Dado a resposta de GET /public/availability, então ela contém só inícios
    // livres; nenhuma informação sobre agendamentos, pacientes ou bloqueios (nem o motivo).
    it('[CA-3.25] 09/11 com CONFIRMED 09:00 e bloqueio "Curso" 14:00–15:00 → só datas e inícios livres', async () => {
      // Dado
      const appt = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 09:00'),
        durationMinutes: 30,
        status: 'CONFIRMED',
        contactName: 'Mariana Sigilosa Teixeira',
        contactEmail: 'mariana.sigilosa@example.com',
      });
      await makeBlock(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 14:00'),
        endAt: clinicInstant('2026-11-09 15:00'),
        reason: 'Curso',
      });
      // Quando
      const res = await availability('?from=2026-11-09&to=2026-11-09');
      // Então
      expect(res.status).toBe(200);
      const body = res.body as AvailabilityResponse;
      expect(Object.keys(body)).toEqual([
        'timeZone',
        'durationMinutes',
        'days',
      ]);
      for (const day of body.days) {
        expect(Object.keys(day)).toEqual(['date', 'starts']);
      }
      expect(res.body.days).toEqual([
        {
          date: '2026-11-09',
          starts: isoStarts(
            '2026-11-09',
            '08:00',
            '08:30',
            '09:30',
            '10:00',
            '10:30',
            '13:30',
            '15:00',
            '15:30',
            '16:00',
            '16:30',
          ),
        },
      ]);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('Curso');
      expect(raw).not.toContain('Mariana');
      expect(raw).not.toContain('mariana.sigilosa');
      expect(raw).not.toContain(appt.id);
    });
  });
});
