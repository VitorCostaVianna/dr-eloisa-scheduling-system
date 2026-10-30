import request from 'supertest';
import { createTestApp, loginAsDentist, type TestApp } from '../../support/app';
import { truncateAll } from '../../support/db';
import { makeService, seedProfessional } from '../../support/factories';

describe('Procedimentos (e2e)', () => {
  let ctx: TestApp;
  let professionalId: string;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.prisma);
    ({ professionalId } = await seedProfessional(ctx.prisma));
    // Um login só: POST /auth/login limita a 5 por minuto (429), e a suíte tem mais testes.
    cookie = await loginAsDentist(ctx.app);
  });

  beforeEach(async () => {
    // Não usa truncateAll aqui: apagaria o usuário do cookie. Cada teste parte sem procedimentos.
    await ctx.prisma.service.deleteMany();
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await ctx.app.close();
  });

  const http = () => request(ctx.app.getHttpServer());
  const post = (body: object) =>
    http().post('/procedures').set('Cookie', cookie).send(body);
  const patch = (id: string, body: object) =>
    http().patch(`/procedures/${id}`).set('Cookie', cookie).send(body);

  describe('[RN-05] duração do procedimento: 30, 60 ou 90 min', () => {
    // CA-1.5: Dado o painel, quando a dentista salva um procedimento de 120 min, então a API
    // recusa (máximo 90, RN-05).
    it('[CA-1.5] 120 min → 422 INVALID_DURATION e nada é criado', async () => {
      // Dado
      const before = await ctx.prisma.service.count();
      // Quando
      const res = await post({ name: 'Canal', durationMinutes: 120 });
      // Então
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_DURATION');
      const after = await ctx.prisma.service.count();
      expect(after).toBe(before);
    });

    // CA-1.18: Dado o painel, quando a dentista cria um procedimento de 45 min, então a API
    // recusa (RN-05); de 30, 60 ou 90 min, aceita; nome repetido entre ativos (sem
    // diferenciar maiúsculas), recusa.
    it('[CA-1.18] 45 min → 422 INVALID_DURATION', async () => {
      const res = await post({ name: 'Clareamento', durationMinutes: 45 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_DURATION');
    });

    it.each([30, 60, 90])(
      '[CA-1.18] %i min → 201 com o corpo do procedimento',
      async (durationMinutes) => {
        const name = `Procedimento ${durationMinutes}`;
        const res = await post({ name, durationMinutes });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({
          id: expect.any(String),
          name,
          durationMinutes,
          active: true,
        });
      },
    );

    it('[CA-1.18] "Limpeza" ativo e depois "limpeza" → 409 PROCEDURE_NAME_TAKEN', async () => {
      const first = await post({ name: 'Limpeza', durationMinutes: 30 });
      expect(first.status).toBe(201);
      const res = await post({ name: 'limpeza', durationMinutes: 30 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PROCEDURE_NAME_TAKEN');
    });
  });

  describe('[RN-40] procedimento desativado e unicidade de nome entre ativos', () => {
    // CA-1.19 (parte desta tarefa): Dado um procedimento desativado, então ele some de
    // `GET /public/procedures` e da seleção de novos agendamentos, e continua aparecendo em
    // agendamentos que já o usam.
    it('[CA-1.19] desativado some de GET /public/procedures e segue em GET /procedures com active:false', async () => {
      // Dado
      const created = await post({ name: 'Restauração', durationMinutes: 60 });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      // Quando
      const res = await patch(id, { active: false });
      expect(res.status).toBe(200);
      // Então
      const pub = await http().get('/public/procedures');
      expect(pub.status).toBe(200);
      expect(pub.body).toEqual([]);
      const own = await http().get('/procedures').set('Cookie', cookie);
      expect(own.status).toBe(200);
      expect(own.body).toEqual([
        { id, name: 'Restauração', durationMinutes: 60, active: false },
      ]);
      // complemento na Tarefa 12 (GET /calendar): agendamento que já usa o
      // procedimento continua mostrando procedureName igual ao nome.
    });

    it('PATCH renomeando para "LIMPEZA" com "Limpeza" ativo → 409 PROCEDURE_NAME_TAKEN', async () => {
      await post({ name: 'Limpeza', durationMinutes: 30 }).expect(201);
      const other = await post({ name: 'Profilaxia', durationMinutes: 30 });
      const res = await patch(other.body.id, { name: 'LIMPEZA' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PROCEDURE_NAME_TAKEN');
    });

    it('reativar "Limpeza" inativo com outro "Limpeza" ativo → 409 PROCEDURE_NAME_TAKEN', async () => {
      const inactive = await makeService(ctx.prisma, {
        professionalId,
        name: 'Limpeza',
        active: false,
      });
      await makeService(ctx.prisma, { professionalId, name: 'Limpeza' });
      const res = await patch(inactive.id, { active: true });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PROCEDURE_NAME_TAKEN');
    });

    it('POST com professionalId no corpo → 400 VALIDATION_FAILED', async () => {
      const res = await post({
        name: 'Canal',
        durationMinutes: 60,
        professionalId: '00000000-0000-4000-8000-000000000000',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('PATCH de id inexistente (UUID válido) → 404 NOT_FOUND', async () => {
      const res = await patch('00000000-0000-4000-8000-000000000000', {
        active: false,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('nome com quebra de linha → 400', async () => {
      const res = await post({ name: 'Canal\nradicular', durationMinutes: 60 });
      expect(res.status).toBe(400);
    });

    it.each([{ name: null }, { active: null }, { durationMinutes: null }])(
      'PATCH %j → 400 VALIDATION_FAILED e o procedimento não muda',
      async (body) => {
        const { id } = await makeService(ctx.prisma, {
          professionalId,
          name: 'Limpeza',
          durationMinutes: 60,
        });
        const res = await patch(id, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        const row = await ctx.prisma.service.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          name: 'Limpeza',
          durationMinutes: 60,
          active: true,
        });
      },
    );

    it('GET /public/procedures vem ordenado por nome e sem o campo active', async () => {
      await makeService(ctx.prisma, {
        professionalId,
        name: 'Canal',
        durationMinutes: 90,
      });
      await makeService(ctx.prisma, {
        professionalId,
        name: 'Avaliação',
        durationMinutes: 30,
      });
      await makeService(ctx.prisma, {
        professionalId,
        name: 'Limpeza',
        durationMinutes: 60,
      });
      const res = await http().get('/public/procedures');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: expect.any(String), name: 'Avaliação', durationMinutes: 30 },
        { id: expect.any(String), name: 'Canal', durationMinutes: 90 },
        { id: expect.any(String), name: 'Limpeza', durationMinutes: 60 },
      ]);
    });
  });
});
