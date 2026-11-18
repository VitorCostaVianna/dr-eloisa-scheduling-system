import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/common/configure-app';
import { CLOCK } from '../../src/common/time/clock';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BASE_NOW, FixedClock } from './clock';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  clock: FixedClock;
}

/** App completa (mesmo `configureApp` da produção) com o relógio trocado por um falso. */
export async function createTestApp(
  opts: { clock?: FixedClock } = {},
): Promise<TestApp> {
  const clock = opts.clock ?? new FixedClock(BASE_NOW);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), clock };
}

/** Só faz o POST /auth/login; quem cria o usuário é o teste. Devolve os Set-Cookie. */
export async function loginAsDentist(
  app: NestExpressApplication,
  email: string = process.env.SEED_DENTIST_EMAIL ?? 'dentista@example.com',
  password: string = process.env.SEED_DENTIST_PASSWORD ?? 'mude-esta-senha-123',
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(201);
  return res.get('Set-Cookie') ?? [];
}
