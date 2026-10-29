import request from 'supertest';
import { createTestApp, TestApp } from '../support/app';

describe('Formato de erro da API (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('validação falha com 400 VALIDATION_FAILED e só nomes de campo em details', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fields).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
    // Nunca devolve o valor digitado.
    expect(JSON.stringify(res.body.details)).not.toMatch(/\b1\b/);
    expect(JSON.stringify(res.body)).not.toMatch(/"email":\s*1\b/);
  });

  it('rota inexistente mantém o corpo padrão do Nest (404)', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/rota-inexistente');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: expect.any(String),
      error: 'Not Found',
    });
  });

  it('GET /auth/me sem cookie continua 401 pelo filtro', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.statusCode).toBe(401);
  });
});
