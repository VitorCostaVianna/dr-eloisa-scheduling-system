import { config } from 'dotenv';
config({ path: '.env.test' });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = new PrismaClient();
  const email = 'auth-e2e@example.com';
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const passwordHash = await argon2.hash(password);
    await prisma.user.create({
      data: { email, passwordHash, role: 'DENTIST' },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects a protected route without a session', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects login with the wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in, accesses a protected route, refreshes, then logs out', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const cookies = loginRes.get('Set-Cookie');
    expect(cookies).toBeDefined();

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookies!)
      .expect(200);
    expect(meRes.body.role).toBe('DENTIST');

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies!)
      .expect(201);
    const refreshedCookies = refreshRes.get('Set-Cookie');
    expect(refreshedCookies).toBeDefined();

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', refreshedCookies!)
      .expect(201);

    // Logout limpa os cookies via Set-Cookie na resposta (efetivo no navegador real);
    // reenviar refreshedCookies aqui testaria o access token JWT ainda dentro do seu
    // TTL de 15min, que é stateless e não é invalidado no logout por design (só o
    // refresh token é revogado) — usar os cookies (vazios) que o próprio logout setou
    // é o que de fato simula o navegador limpando a sessão.
    const clearedCookies = logoutRes.get('Set-Cookie');
    expect(clearedCookies).toBeDefined();

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', clearedCookies!)
      .expect(401);

    // A checagem acima só prova que os cookies foram limpos client-side — verdade pra
    // qualquer cookie ausente/inválido, não prova revogação server-side. Reusar
    // refreshedCookies (capturado logo após o /auth/refresh, antes do logout limpar
    // qualquer coisa) contra /auth/refresh de novo prova que AuthService.logout de fato
    // revogou o refresh token no banco — se não tivesse revogado, este refresh teria
    // sucesso (o token ainda não expirou, só foi "esquecido" pelo cookie jar).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshedCookies!)
      .expect(401);
  });
});
