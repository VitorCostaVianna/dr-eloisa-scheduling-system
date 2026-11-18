import request from 'supertest';
import { clinicHolidays } from '../../../src/scheduling/domain/holidays';
import { createTestApp, loginAsDentist, type TestApp } from '../../support/app';
import { truncateAll } from '../../support/db';
import { seedProfessional } from '../../support/factories';

describe('Feriados e desbloqueio de feriado (e2e)', () => {
  let ctx: TestApp;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    await seedProfessional(ctx.prisma);
    // Um login só: POST /auth/login limita a 5 por minuto (429).
    cookie = await loginAsDentist(ctx.app);
  });

  beforeEach(async () => {
    // Não usa truncateAll: apagaria o usuário do cookie.
    await ctx.prisma.holidayOverride.deleteMany();
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const postOverride = (body: object) =>
    http().post('/holiday-overrides').set('Cookie', cookie).send(body);
  const deleteOverride = (date: string) =>
    http().delete(`/holiday-overrides/${date}`).set('Cookie', cookie);
  const listHolidays = (year: number | string) =>
    http().get(`/holidays?year=${year}`).set('Cookie', cookie);

  describe('[RN-46] desbloqueio de feriado', () => {
    // CA-1.25: Dado uma data que não é feriado (ex.: 10/11/2026), quando a dentista tenta
    // desbloqueá-la, então 422. Dado o mesmo feriado desbloqueado duas vezes, então existe
    // uma só linha (idempotente ou 409). O plano escolheu idempotente.
    it('[CA-1.25] 10/11/2026 (não é feriado) → 422 NOT_A_HOLIDAY, nada gravado', async () => {
      // Dado
      const before = await ctx.prisma.holidayOverride.count();
      // Quando
      const res = await postOverride({ date: '2026-11-10' });
      // Então
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOT_A_HOLIDAY');
      expect(await ctx.prisma.holidayOverride.count()).toBe(before);
    });

    it('[CA-1.25] 08/12/2026 desbloqueado duas vezes → 201 nas duas, mesmo corpo, uma linha só', async () => {
      // Dado
      expect(await ctx.prisma.holidayOverride.count()).toBe(0);
      // Quando
      const first = await postOverride({ date: '2026-12-08' });
      const second = await postOverride({ date: '2026-12-08' });
      // Então
      expect(first.status).toBe(201);
      expect(first.body).toEqual({
        id: expect.any(String),
        date: '2026-12-08',
      });
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await ctx.prisma.holidayOverride.count()).toBe(1);
    });

    it('GET /holidays?year=2026 → 15 feriados por data; 08/12 desbloqueado e depois desfeito', async () => {
      const expected2026 = [...clinicHolidays(2026).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, name]) => ({ date, name, overridden: false }));
      const withOverride = (date: string, overridden: boolean) =>
        expected2026.map((h) => (h.date === date ? { ...h, overridden } : h));

      // Sem desbloqueio: todos fechados
      const initial = await listHolidays(2026);
      expect(initial.status).toBe(200);
      expect(initial.body).toHaveLength(15);
      expect(initial.body).toEqual(expected2026);

      // Desbloqueia 08/12
      expect((await postOverride({ date: '2026-12-08' })).status).toBe(201);
      const afterPost = await listHolidays(2026);
      expect(afterPost.status).toBe(200);
      expect(afterPost.body).toEqual(withOverride('2026-12-08', true));

      // Desfaz: 204 e volta a fechar
      const del = await deleteOverride('2026-12-08');
      expect(del.status).toBe(204);
      expect(await ctx.prisma.holidayOverride.count()).toBe(0);
      const afterDelete = await listHolidays(2026);
      expect(afterDelete.status).toBe(200);
      expect(afterDelete.body).toEqual(expected2026);

      // DELETE repetido é idempotente
      const again = await deleteOverride('2026-12-08');
      expect(again.status).toBe(204);
      expect(await ctx.prisma.holidayOverride.count()).toBe(0);
    });

    describe('entradas inválidas → 400 VALIDATION_FAILED', () => {
      it('GET /holidays?year=1999', async () => {
        const res = await listHolidays(1999);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

      it('DELETE /holiday-overrides/2026-02-30', async () => {
        const res = await deleteOverride('2026-02-30');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

      it.each(['2026.5', 'abc'])('GET /holidays?year=%s', async (year) => {
        const res = await listHolidays(year);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

      // professionalId nunca vem do cliente (guia §6): forbidNonWhitelisted recusa.
      it('POST com professionalId no corpo → fields [professionalId], nada gravado', async () => {
        const before = await ctx.prisma.holidayOverride.count();
        const res = await postOverride({
          date: '2026-12-08',
          professionalId: '00000000-0000-0000-0000-000000000000',
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(res.body.details.fields).toEqual(['professionalId']);
        expect(await ctx.prisma.holidayOverride.count()).toBe(before);
      });

      it('POST {} → fields [date]', async () => {
        const res = await postOverride({});
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(res.body.details.fields).toEqual(['date']);
      });

      // Ano fora de 2000..2100: o desbloqueio ficaria invisível no GET /holidays.
      it.each(['1999-12-25', '2101-01-01'])(
        'POST {date: %s} (ano fora da faixa) → fields [date], nada gravado',
        async (date) => {
          const before = await ctx.prisma.holidayOverride.count();
          const res = await postOverride({ date });
          expect(res.status).toBe(400);
          expect(res.body.code).toBe('VALIDATION_FAILED');
          expect(res.body.details.fields).toEqual(['date']);
          expect(await ctx.prisma.holidayOverride.count()).toBe(before);
        },
      );
    });

    it('feriado móvel de outro ano: 08/02/2027 (Carnaval, segunda) → 201 e aparece desbloqueado em 2027', async () => {
      // Quando
      const res = await postOverride({ date: '2027-02-08' });
      // Então
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: expect.any(String), date: '2027-02-08' });
      const list = await listHolidays(2027);
      expect(list.status).toBe(200);
      expect(
        list.body.filter((h: { overridden: boolean }) => h.overridden),
      ).toEqual([
        {
          date: '2027-02-08',
          name: clinicHolidays(2027).get('2027-02-08'),
          overridden: true,
        },
      ]);
    });

    describe('sem sessão → 401 (guia §6), nada gravado', () => {
      it('GET /holidays', async () => {
        const res = await http().get('/holidays?year=2026');
        expect(res.status).toBe(401);
      });

      it('POST /holiday-overrides', async () => {
        const before = await ctx.prisma.holidayOverride.count();
        const res = await http()
          .post('/holiday-overrides')
          .send({ date: '2026-12-08' });
        expect(res.status).toBe(401);
        expect(await ctx.prisma.holidayOverride.count()).toBe(before);
      });

      it('DELETE /holiday-overrides/:date', async () => {
        const res = await http().delete('/holiday-overrides/2026-12-08');
        expect(res.status).toBe(401);
      });
    });
  });
});
