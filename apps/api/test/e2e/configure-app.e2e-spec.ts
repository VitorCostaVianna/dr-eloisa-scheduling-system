import request from 'supertest';
import { createTestApp, TestApp } from '../support/app';

describe('configureApp (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('ativa o helmet (x-content-type-options: nosniff)', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejeita campo extra no corpo (forbidNonWhitelisted)', () => {
    return request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'a@example.com', password: 'whatever-123', extra: 1 })
      .expect(400);
  });
});
