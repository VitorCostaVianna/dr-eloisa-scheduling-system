import request from 'supertest';
import { CLINIC_TIME_ZONE } from '../../../src/common/time/clinic-time';
import { createTestApp, loginAsDentist, type TestApp } from '../../support/app';
import { clinicInstant } from '../../support/clock';
import { truncateAll } from '../../support/db';
import {
  makeAppointment,
  makeBlock,
  makeHolidayOverride,
  makeService,
  seedProfessional,
} from '../../support/factories';

// Relógio: BASE_NOW = domingo 01/11/2026 12:00 (clínica); todas as datas abaixo são futuras.
describe('Calendário do painel (e2e)', () => {
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
  const calendar = (from: string, to: string) =>
    http().get(`/calendar?from=${from}&to=${to}`).set('Cookie', cookie);
  const iso = (local: string) => clinicInstant(local).toISOString();

  describe('[RN-01] dias do calendário com as faixas da semana', () => {
    it('segunda 09/11 vazia → faixas da RN-01 em ISO, sem feriado, bloqueio nem agendamento', async () => {
      // Quando
      const res = await calendar('2026-11-09', '2026-11-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        timeZone: CLINIC_TIME_ZONE,
        days: [
          {
            date: '2026-11-09',
            dayOfWeek: 1,
            workingHours: [
              {
                startAt: iso('2026-11-09 08:00'),
                endAt: iso('2026-11-09 11:00'),
              },
              {
                startAt: iso('2026-11-09 13:30'),
                endAt: iso('2026-11-09 17:00'),
              },
            ],
            holiday: null,
          },
        ],
        blocks: [],
        appointments: [],
      });
    });

    it('traz bloqueio (com motivo) e só agendamentos ocupantes, por startAt', async () => {
      // Dado: criados fora de ordem; um CANCELLED que não deve aparecer
      const late = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 14:00'),
        status: 'PENDING',
        contactName: 'Paciente Tarde',
      });
      const early = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 08:00'),
        status: 'CONFIRMED',
        contactName: 'Paciente Manhã',
      });
      await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 10:00'),
        status: 'CANCELLED',
      });
      await makeBlock(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 15:00'),
        endAt: clinicInstant('2026-11-09 16:00'),
        reason: 'Curso',
      });
      // Quando
      const res = await calendar('2026-11-09', '2026-11-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.blocks).toEqual([
        {
          id: expect.any(String),
          startAt: iso('2026-11-09 15:00'),
          endAt: iso('2026-11-09 16:00'),
          reason: 'Curso',
          createdAt: expect.any(String),
        },
      ]);
      expect(res.body.appointments).toEqual([
        {
          id: early.id,
          startAt: iso('2026-11-09 08:00'),
          endAt: iso('2026-11-09 08:30'),
          status: 'CONFIRMED',
          contactName: 'Paciente Manhã',
          procedureName: null,
          onHoliday: false,
          outsideWorkingHours: false,
        },
        {
          id: late.id,
          startAt: iso('2026-11-09 14:00'),
          endAt: iso('2026-11-09 14:30'),
          status: 'PENDING',
          contactName: 'Paciente Tarde',
          procedureName: null,
          onHoliday: false,
          outsideWorkingHours: false,
        },
      ]);
    });
  });

  describe('[RN-08] feriados no painel', () => {
    // CA-1.8: Dado 02/11/2026 (Finados, segunda), 20/11/2026 (Consciência Negra, sexta),
    // 25/12/2026 (sexta), 08/12/2026 (Imaculada Conceição, BH, terça), 26/03/2027
    // (Sexta-feira Santa), 27/05/2027 (Corpus Christi, quinta) e 15/08/2028 (Assunção, BH,
    // terça), então nenhum início nesses dias, e o painel mostra cada um como feriado com o
    // nome. Nomes conforme a tabela da spec 9.4 (domain/holidays.ts).
    it.each([
      ['2026-11-02', 'Finados'],
      ['2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
      ['2026-12-25', 'Natal'],
      ['2026-12-08', 'Imaculada Conceição'],
      ['2027-03-26', 'Sexta-feira da Paixão'],
      ['2027-05-27', 'Corpus Christi'],
      ['2028-08-15', 'Assunção de Nossa Senhora'],
    ])(
      '[CA-1.8] %s → holiday { name: %s, overridden: false }',
      async (date, name) => {
        // Quando
        const res = await calendar(date, date);
        // Então
        expect(res.status).toBe(200);
        expect(res.body.days).toHaveLength(1);
        expect(res.body.days[0].date).toBe(date);
        expect(res.body.days[0].holiday).toEqual({ name, overridden: false });
      },
    );

    // Foco da revisão, item 1: a janela cruza o ano; os feriados de 2027 também entram.
    it('janela 28/12/2026..03/01/2027 → 01/01/2027 "Confraternização Universal"; demais sem feriado', async () => {
      // Quando
      const res = await calendar('2026-12-28', '2027-01-03');
      // Então
      expect(res.status).toBe(200);
      expect(
        res.body.days.map((d: { date: string; holiday: unknown }) => [
          d.date,
          d.holiday,
        ]),
      ).toEqual([
        ['2026-12-28', null],
        ['2026-12-29', null],
        ['2026-12-30', null],
        ['2026-12-31', null],
        [
          '2027-01-01',
          { name: 'Confraternização Universal', overridden: false },
        ],
        ['2027-01-02', null],
        ['2027-01-03', null],
      ]);
    });
  });

  describe('[RN-46] desbloqueio de feriado no painel', () => {
    // CA-1.23: Dado 08/12/2026 (feriado, terça), quando a dentista desbloqueia esse dia,
    // então a disponibilidade pública de 08/12 é a de uma terça normal (RN-01), e o painel
    // mostra o dia como "feriado — atendendo".
    it('[CA-1.23] 08/12 desbloqueado → holiday { Imaculada Conceição, overridden: true }', async () => {
      // Dado
      const override = await http()
        .post('/holiday-overrides')
        .set('Cookie', cookie)
        .send({ date: '2026-12-08' });
      expect(override.status).toBe(201);
      // Quando
      const res = await calendar('2026-12-08', '2026-12-08');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.days).toEqual([
        {
          date: '2026-12-08',
          dayOfWeek: 2,
          workingHours: [
            {
              startAt: iso('2026-12-08 08:00'),
              endAt: iso('2026-12-08 11:00'),
            },
            {
              startAt: iso('2026-12-08 13:30'),
              endAt: iso('2026-12-08 16:30'),
            },
          ],
          holiday: { name: 'Imaculada Conceição', overridden: true },
        },
      ]);
    });

    // CA-1.26: Dado 08/12/2026 desbloqueado com um agendamento marcado nele, quando a
    // dentista desfaz o desbloqueio, então o dia volta a não ter inícios livres, o
    // agendamento continua como estava e o painel o destaca como "em feriado".
    it('[CA-1.26] desfazer o desbloqueio de 08/12 fecha o dia, mantém o agendamento e o marca onHoliday', async () => {
      // Dado
      await makeHolidayOverride(ctx.prisma, {
        professionalId,
        date: '2026-12-08',
      });
      const appt = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-12-08 09:00'),
        durationMinutes: 30,
        status: 'CONFIRMED',
      });
      const before = await calendar('2026-12-08', '2026-12-08');
      expect(before.status).toBe(200);
      expect(before.body.appointments).toHaveLength(1);
      expect(before.body.appointments[0].onHoliday).toBe(false);
      // Quando
      const del = await http()
        .delete('/holiday-overrides/2026-12-08')
        .set('Cookie', cookie);
      expect(del.status).toBe(204);
      // Então: o dia volta a não ter inícios livres
      const avail = await http().get(
        '/public/availability?from=2026-12-08&to=2026-12-08',
      );
      expect(avail.status).toBe(200);
      expect(avail.body.days).toEqual([{ date: '2026-12-08', starts: [] }]);
      // Então: o agendamento continua como estava
      const row = await ctx.prisma.appointment.findUniqueOrThrow({
        where: { id: appt.id },
      });
      expect(row.status).toBe('CONFIRMED');
      expect(row.startAt.toISOString()).toBe(iso('2026-12-08 09:00'));
      expect(row.endAt.toISOString()).toBe(iso('2026-12-08 09:30'));
      // Então: o painel o destaca como "em feriado"
      const after = await calendar('2026-12-08', '2026-12-08');
      expect(after.status).toBe(200);
      expect(after.body.days[0].holiday).toEqual({
        name: 'Imaculada Conceição',
        overridden: false,
      });
      expect(after.body.appointments).toHaveLength(1);
      expect(after.body.appointments[0]).toMatchObject({
        id: appt.id,
        startAt: iso('2026-12-08 09:00'),
        endAt: iso('2026-12-08 09:30'),
        status: 'CONFIRMED',
        onHoliday: true,
      });
    });
  });

  // Revisão da Tarefa 12, Minor 3: agendamento que começa antes de `from` e entra na
  // janela. O feriado e o desbloqueio valem pelo dia do INÍCIO (08/12), que está fora da
  // janela pedida (09/12): o serviço precisa buscá-los também para esse dia.
  describe('[RN-46] agendamento que começa antes da janela (borda)', () => {
    it('08/12 23:30–09/12 00:30, janela só 09/12, 08/12 feriado fechado → aparece com onHoliday: true', async () => {
      // Dado: 08/12/2026 (Imaculada Conceição) sem desbloqueio
      const appt = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-12-08 23:30'),
        durationMinutes: 60,
        status: 'CONFIRMED',
        contactName: 'Paciente Noturno',
      });
      // Quando
      const res = await calendar('2026-12-09', '2026-12-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.days.map((d: { date: string }) => d.date)).toEqual([
        '2026-12-09',
      ]);
      expect(res.body.appointments).toEqual([
        {
          id: appt.id,
          startAt: iso('2026-12-08 23:30'),
          endAt: iso('2026-12-09 00:30'),
          status: 'CONFIRMED',
          contactName: 'Paciente Noturno',
          procedureName: null,
          onHoliday: true,
          outsideWorkingHours: true,
        },
      ]);
    });

    it('mesmo agendamento com 08/12 desbloqueado → onHoliday: false', async () => {
      // Dado: 08/12/2026 desbloqueado
      await makeHolidayOverride(ctx.prisma, {
        professionalId,
        date: '2026-12-08',
      });
      const appt = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-12-08 23:30'),
        durationMinutes: 60,
        status: 'CONFIRMED',
        contactName: 'Paciente Noturno',
      });
      // Quando
      const res = await calendar('2026-12-09', '2026-12-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.appointments).toEqual([
        {
          id: appt.id,
          startAt: iso('2026-12-08 23:30'),
          endAt: iso('2026-12-09 00:30'),
          status: 'CONFIRMED',
          contactName: 'Paciente Noturno',
          procedureName: null,
          onHoliday: false,
          outsideWorkingHours: true,
        },
      ]);
    });
  });

  describe('[RN-40] procedimento desativado segue nos agendamentos', () => {
    // CA-1.19: Dado um procedimento desativado, então ele some de GET /public/procedures e
    // da seleção de novos agendamentos, e continua aparecendo em agendamentos que já o usam.
    // (Parte "some da lista pública" em procedures.e2e-spec.ts.)
    it('[CA-1.19] agendamento com procedimento desativado → procedureName = o nome', async () => {
      // Dado
      const service = await makeService(ctx.prisma, {
        professionalId,
        name: 'Clareamento',
        durationMinutes: 60,
        active: false,
      });
      await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 09:00'),
        durationMinutes: 60,
        serviceId: service.id,
      });
      // Quando
      const res = await calendar('2026-11-09', '2026-11-09');
      // Então
      expect(res.status).toBe(200);
      expect(res.body.appointments).toHaveLength(1);
      expect(res.body.appointments[0].procedureName).toBe('Clareamento');
    });
  });

  describe('[RN-45] agendamento fora do horário semanal', () => {
    it('segunda 09/11: 09:00–09:30 dentro; 10:45–11:15 cruza o almoço; 11:30–12:00 no almoço', async () => {
      // Dado
      const inside = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 09:00'),
        durationMinutes: 30,
      });
      const crossing = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 10:45'),
        durationMinutes: 30,
      });
      const lunch = await makeAppointment(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-09 11:30'),
        durationMinutes: 30,
      });
      // Quando
      const res = await calendar('2026-11-09', '2026-11-09');
      // Então
      expect(res.status).toBe(200);
      expect(
        res.body.appointments.map(
          (a: { id: string; outsideWorkingHours: boolean }) => [
            a.id,
            a.outsideWorkingHours,
          ],
        ),
      ).toEqual([
        [inside.id, false],
        [crossing.id, true],
        [lunch.id, true],
      ]);
    });
  });

  describe('[API] janela do calendário e sessão', () => {
    it.each([
      ['32 dias (01/11..02/12)', '2026-11-01', '2026-12-02'],
      ['to < from', '2026-11-10', '2026-11-09'],
    ])('%s → 400 VALIDATION_FAILED', async (_name, from, to) => {
      const res = await calendar(from, to);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    // Re-revisão I-1: o calendário lê a véspera de `from`; ano 0 viraria ano -1 → 500.
    // Limites de ano da borda (IsLocalDate): 1..9998. Fora → 400; dentro → 200, nunca 500.
    it.each([['0000-01-01'], ['9999-01-01']])(
      'from=to=%s (fora dos anos 1..9998) → 400 VALIDATION_FAILED',
      async (date) => {
        const res = await calendar(date, date);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      },
    );

    it.each([['0001-01-01'], ['9998-12-31']])(
      'from=to=%s (borda dos anos aceitos) → 200 com o dia',
      async (date) => {
        const res = await calendar(date, date);
        expect(res.status).toBe(200);
        expect(res.body.days).toHaveLength(1);
        expect(res.body.days[0].date).toBe(date);
      },
    );

    it('sem sessão → 401', async () => {
      const res = await http().get('/calendar?from=2026-11-09&to=2026-11-09');
      expect(res.status).toBe(401);
    });
  });
});
