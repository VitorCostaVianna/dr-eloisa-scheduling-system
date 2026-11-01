import request from 'supertest';
import { DEFAULT_WEEKLY_HOURS } from '../../../src/scheduling/domain/default-working-hours';
import { createTestApp, loginAsDentist, type TestApp } from '../../support/app';
import { clinicInstant } from '../../support/clock';
import { truncateAll } from '../../support/db';
import { makeBlock, seedProfessional } from '../../support/factories';

describe('Horário semanal e bloqueios (e2e)', () => {
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
    await ctx.prisma.scheduleBlock.deleteMany();
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const post = (body: object) =>
    http().post('/blocks').set('Cookie', cookie).send(body);
  const iso = (local: string) => clinicInstant(local).toISOString();

  describe('[RN-01] horário semanal', () => {
    it('GET /working-hours devolve as 9 linhas da RN-01 por dia e início', async () => {
      const res = await http().get('/working-hours').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(9);
      expect(res.body).toEqual(
        DEFAULT_WEEKLY_HOURS.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
        })),
      );
    });
  });

  describe('[RN-42] bloqueios', () => {
    // CA-1.15: Dado um bloqueio de dia inteiro de 16/11 a 20/11, então nenhum início nesses
    // dias é oferecido. (Parte "nenhum início" no e2e da Tarefa 12; aqui, o bloqueio criado.)
    it('[CA-1.15] POST FULL_DAYS 16/11..20/11 → 201 com [16/11 00:00, 21/11 00:00)', async () => {
      const res = await post({
        kind: 'FULL_DAYS',
        fromDate: '2026-11-16',
        toDate: '2026-11-20',
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        startAt: iso('2026-11-16 00:00'),
        endAt: iso('2026-11-21 00:00'),
        reason: null,
        createdAt: expect.any(String),
      });
    });

    it('POST PERIOD → 201 com BlockDto', async () => {
      const res = await post({
        kind: 'PERIOD',
        startAt: iso('2026-11-09 16:00'),
        endAt: iso('2026-11-10 09:00'),
        reason: 'Congresso',
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        startAt: iso('2026-11-09 16:00'),
        endAt: iso('2026-11-10 09:00'),
        reason: 'Congresso',
        createdAt: expect.any(String),
      });
    });

    it('GET /blocks?from=2026-11-01&to=2026-11-30 lista os que intersectam, por startAt', async () => {
      // Dado: dois dentro da janela (criados fora de ordem) e um fora
      await makeBlock(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-20 08:00'),
        endAt: clinicInstant('2026-11-20 09:00'),
      });
      await makeBlock(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-11-05 08:00'),
        endAt: clinicInstant('2026-11-05 09:00'),
        reason: 'Dentro',
      });
      await makeBlock(ctx.prisma, {
        professionalId,
        startAt: clinicInstant('2026-10-05 08:00'),
        endAt: clinicInstant('2026-10-05 09:00'),
      });
      // Quando
      const res = await http()
        .get('/blocks?from=2026-11-01&to=2026-11-30')
        .set('Cookie', cookie);
      // Então
      expect(res.status).toBe(200);
      expect(res.body.map((b: { startAt: string }) => b.startAt)).toEqual([
        iso('2026-11-05 08:00'),
        iso('2026-11-20 08:00'),
      ]);
      expect(res.body[0]).toEqual({
        id: expect.any(String),
        startAt: iso('2026-11-05 08:00'),
        endAt: iso('2026-11-05 09:00'),
        reason: 'Dentro',
        createdAt: expect.any(String),
      });
    });

    it('DELETE /blocks/:id → 204 e depois 404 NOT_FOUND', async () => {
      const created = await post({
        kind: 'FULL_DAYS',
        fromDate: '2026-12-01',
        toDate: '2026-12-01',
      });
      expect(created.status).toBe(201);
      const first = await http()
        .delete(`/blocks/${created.body.id}`)
        .set('Cookie', cookie);
      expect(first.status).toBe(204);
      expect(await ctx.prisma.scheduleBlock.count()).toBe(0);
      const second = await http()
        .delete(`/blocks/${created.body.id}`)
        .set('Cookie', cookie);
      expect(second.status).toBe(404);
      expect(second.body.code).toBe('NOT_FOUND');
    });

    describe('entradas inválidas → 400 VALIDATION_FAILED, nada gravado', () => {
      const cases: [string, object][] = [
        [
          'FULL_DAYS com toDate < fromDate',
          { kind: 'FULL_DAYS', fromDate: '2026-11-20', toDate: '2026-11-16' },
        ],
        [
          'PERIOD com endAt = startAt',
          {
            kind: 'PERIOD',
            startAt: iso('2026-11-09 10:00'),
            endAt: iso('2026-11-09 10:00'),
          },
        ],
        [
          'fromDate inexistente (2026-02-30)',
          { kind: 'FULL_DAYS', fromDate: '2026-02-30', toDate: '2026-03-02' },
        ],
        [
          'startAt sem fuso (2026-11-09T10:00)',
          {
            kind: 'PERIOD',
            startAt: '2026-11-09T10:00',
            endAt: iso('2026-11-09 12:00'),
          },
        ],
      ];
      it.each(cases)('%s', async (_name, body) => {
        const before = await ctx.prisma.scheduleBlock.count();
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(await ctx.prisma.scheduleBlock.count()).toBe(before);
      });
    });

    it('details do erro de validação não contém o texto do motivo', async () => {
      const res = await post({
        kind: 'FULL_DAYS',
        fromDate: '2026-11-20',
        toDate: '2026-11-16',
        reason: 'MOTIVO-SECRETO-XYZ',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toContain('MOTIVO-SECRETO-XYZ');
    });
  });
});
