import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryService,
  ModulesContainer,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import request from 'supertest';
import { IS_PUBLIC_KEY } from '../../../src/auth/decorators/public.decorator';
import { createTestApp, type TestApp } from '../../support/app';

interface RouteInfo {
  method: string;
  path: string;
  isPublic: boolean;
}

const join = (...parts: string[]): string => {
  const path = parts
    .flatMap((p) => p.split('/'))
    .filter((s) => s.length > 0)
    .join('/');
  return `/${path}`;
};

const asPath = (value: unknown): string => {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
};

describe('[Segurança] nega por padrão (spec 10.1)', () => {
  let ctx: TestApp;
  let routes: RouteInfo[];

  // Spec 10.1: o JwtAuthGuard global nega por padrão; só estas rotas recebem @Public()
  // (as 5 da seção 7 + as já públicas GET /, login e refresh do Auth).
  const PUBLIC_ROUTES = [
    'GET /',
    'POST /auth/login',
    'POST /auth/refresh',
    'GET /public/procedures',
    'GET /public/availability',
  ];

  // Rotas autenticadas que existem hoje; garante que a varredura não passa vazia.
  const KNOWN_AUTHENTICATED_ROUTES = [
    'POST /auth/logout',
    'GET /auth/me',
    'GET /blocks',
    'POST /blocks',
    'DELETE /blocks/:id',
    'GET /calendar',
    'GET /holidays',
    'POST /holiday-overrides',
    'DELETE /holiday-overrides/:date',
    'GET /procedures',
    'POST /procedures',
    'PATCH /procedures/:id',
    'GET /working-hours',
  ];

  const label = (r: RouteInfo) => `${r.method} ${r.path}`;

  // O AppModule não importa DiscoveryModule; o DiscoveryService só precisa do ModulesContainer.
  function enumerateRoutes(): RouteInfo[] {
    const discovery = new DiscoveryService(
      ctx.app.get(ModulesContainer, { strict: false }),
    );
    const scanner = new MetadataScanner();
    const reflector = new Reflector();
    const found: RouteInfo[] = [];

    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prefix = asPath(Reflect.getMetadata(PATH_METADATA, metatype));
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, () => unknown>)[name];
        const methodId = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (methodId === undefined) continue;
        const path = asPath(Reflect.getMetadata(PATH_METADATA, handler));
        found.push({
          method: RequestMethod[methodId],
          path: join(prefix, path),
          isPublic:
            reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
              handler,
              metatype,
            ]) === true,
        });
      }
    }
    return found;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    routes = enumerateRoutes();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  // CA-1.22: Dado qualquer rota da dentista sem cookie de sessão, então 401 (teste e2e que
  // percorre todas as rotas do módulo, exceto as públicas listadas na seção 7).
  it('[CA-1.22] o conjunto de rotas @Public() é exatamente a lista fechada', () => {
    const publicRoutes = routes
      .filter((r) => r.isPublic)
      .map(label)
      .sort();
    expect(publicRoutes).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('[CA-1.22] toda rota não pública responde 401 sem cookie', async () => {
    const protectedRoutes = routes.filter((r) => !r.isPublic);

    // Não passa vazio: as rotas autenticadas atuais precisam estar na varredura.
    const labels = protectedRoutes.map(label);
    for (const known of KNOWN_AUTHENTICATED_ROUTES) {
      expect(labels).toContain(known);
    }

    const uuid = '3f0c1c1e-8f4e-4c55-9a3e-2b7f6a1d9e10';
    const date = '2026-12-08';
    const failures: string[] = [];
    for (const route of protectedRoutes) {
      const url = route.path.replace(/:(\w+)/g, (_m, name: string) =>
        name === 'date' ? date : uuid,
      );
      const http = request(ctx.app.getHttpServer());
      const verb = route.method.toLowerCase() as
        'get' | 'post' | 'patch' | 'put' | 'delete';
      // Content-Type JSON para o json-only (CSRF) não responder 415 antes do guard.
      const req = http[verb](url).set('Content-Type', 'application/json');
      const res = await (['get', 'delete'].includes(verb) ? req : req.send({}));
      if (res.status !== 401 || res.body?.message !== 'Unauthorized') {
        failures.push(
          `${label(route)} -> ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
