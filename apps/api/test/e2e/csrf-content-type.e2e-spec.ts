import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, loginAsDentist, TestApp } from '../support/app';
import { truncateAll } from '../support/db';

describe('[CSRF] spec 10.1 — mutação só aceita JSON', () => {
  let ctx: TestApp;
  const email = 'csrf-e2e@example.com';
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    await ctx.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        role: 'DENTIST',
      },
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // CA-3.33: Dado qualquer rota de mutação da API, quando chega com Content-Type
  // form-urlencoded, multipart ou text/plain, então 415 e nada muda. Dado POST
  // /auth/refresh sem corpo e sem Content-Type, então funciona como hoje.
  it.each([
    [
      'application/x-www-form-urlencoded',
      `email=${encodeURIComponent(email)}&password=x`,
    ],
    ['multipart/form-data; boundary=x', '--x--'],
    ['text/plain', JSON.stringify({ email, password })],
  ])('[CA-3.33] POST /auth/login com %s → 415', async (type, body) => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', type)
      .send(body);
    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      statusCode: 415,
      error: 'Unsupported Media Type',
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: expect.any(String),
    });
  });

  it('[CA-3.33] POST /auth/logout autenticado com text/plain → 415 e a sessão continua válida', async () => {
    const cookies = await loginAsDentist(ctx.app, email, password);

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookies)
      .set('Content-Type', 'text/plain')
      .send('x');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    // "Nada muda": o logout não rodou, a sessão segue válida.
    await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookies)
      .expect(200);
  });

  it('[CA-3.33] POST /auth/refresh sem corpo e sem Content-Type, com o cookie de um login → 201', async () => {
    const cookies = await loginAsDentist(ctx.app, email, password);

    const res = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies);
    expect(res.status).toBe(201);
    expect(res.get('Set-Cookie')).toBeDefined();
  });
});
