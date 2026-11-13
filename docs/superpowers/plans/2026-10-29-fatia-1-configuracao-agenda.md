# Fatia 1 — Configuração da agenda — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`, com os
> papéis do `CLAUDE.md` §3 (implementador ≠ testador; revisor no fim de cada tarefa). Os passos
> usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** a dentista entra no painel e cadastra, edita e desativa procedimentos; vê o
horário semanal pré-carregado; cria e apaga bloqueios; vê os feriados de BH no calendário e
desbloqueia um feriado. Por baixo, o motor de horários livres fica pronto e testado, com
`GET /public/availability` e `GET /public/procedures` sem tela pública.

**Arquitetura:** primeiro a fundação do guia §8: build do `shared-types`, typecheck, suítes
unit/int/e2e com `configureApp`, modelo de erro e CSRF por `Content-Type`. Depois todas as
migrations da spec §6, o seed e o domínio puro (`holidays.ts` e `availability.ts`), testado
com relógio falso. Em seguida, os casos de uso e controllers do `SchedulingModule` e, por
último, as telas do painel em Next.js 16 (Server Components lendo com `apiServer`, mutações
com `apiFetch`).

**Stack:** NestJS 11 + Prisma 6.19.3 + Postgres 16; Luxon 3.7.2; Next.js 16.3.3 + React 19;
Jest 30 (api), Vitest + Testing Library + Playwright (web).

**Spec:** `docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md` (§4.1, §4.5,
§6, §7, §8 fatia 1, §9.1, §9.2, §9.4, §10.1, §10.3). Leia também `docs/architecture/arquitetura.md`
(§2.2–2.6, §2.8, §2.12, §3, §4, §5, §7.1, §8) e `docs/architecture/guia-de-desenvolvimento.md`
(§3, §4, §5, §6 fatia 1, §7, §8). Toda tarefa cita a receita do guia que se aplica.

---

## Antes de começar (orquestrador)

- [ ] O usuário revisou as ADRs 020–035. Este plano usa 020–022, 024, 025, 030, 032 e 033, que
      ainda estão como Proposta. ADR rejeitada → replanejar a tarefa afetada antes de
      despachar.
- [ ] O usuário abriu o Docker Desktop: `docker ps` responde e `docker compose up -d` sobe o
      Postgres.
- [ ] Branch `fatia-1-configuracao-agenda` criada a partir do `main` (nunca commitar no
      `main`).
- [ ] O usuário disse se autoriza um commit por tarefa aceita nesta branch (CLAUDE.md §5:
      commit só com pedido). Sem autorização, o passo "Commit" de cada tarefa vira "deixar
      staged e listar no relatório".

**Ciclo de cada tarefa** (CLAUDE.md §3.3, limite de 3 rodadas de correção):

1. **Implementador:** escreve o **esqueleto** da seção *Contratos*. Métodos de comportamento
   só lançam `new NotImplementedException()`. `pnpm typecheck` passa.
2. **Testador** (skill `testes-agendamento`): escreve os testes da seção *Testes de aceite*,
   roda e confirma que estão **vermelhos pelo motivo certo** (asserção ou
   `NotImplementedException`, nunca `Cannot find module`).
3. **Implementador:** faz os testes passarem (TDD, com testes unitários próprios de apoio).
   Nunca edita um teste `[CA-x.y]`.
4. **Testador:** roda a *Verificação* e dá o veredito no formato da skill.
5. **Revisor:** `superpowers:requesting-code-review` + checklist do guia §6 (fatia 1).

Tarefas de infraestrutura sem `CA` (1–4, 14) seguem o mesmo ciclo. O "teste de aceite" delas
é a lista de comandos e asserções da própria tarefa.

## Restrições globais

- `*/domain/**` é puro: sem `@nestjs/*`, sem `@prisma/client`, sem `new Date()`/`Date.now()`.
  `now` entra por parâmetro, vindo do `Clock`.
- Só `apps/api/src/common/time/clinic-time.ts` e `apps/web/src/lib/clinic-time.ts` importam
  `luxon`. Proibidos `getHours()`/`getDay()`/`setHours()`, offset fixo `-03:00` e
  `new Date('YYYY-MM-DD')` (guia §7.1).
- Fuso da clínica: `America/Sao_Paulo`, como constante de código (`CLINIC_TIME_ZONE` no
  `shared-types`). Processo da API com `TZ=UTC`.
- Intervalos semiabertos `[início, fim)` em todo lugar (RN-03). Fim de dia inteiro = 00:00 do
  dia seguinte.
- Proibidos: `$queryRawUnsafe`, `$executeRawUnsafe`, `dangerouslySetInnerHTML`, Server
  Actions.
- `professionalId` nunca vem do cliente: sempre de `ProfessionalContextService`.
- Rotas públicas novas nesta fatia: **somente** `GET /public/procedures` e
  `GET /public/availability`.
- Nenhum dado pessoal ou motivo de bloqueio em log, mensagem de erro, URL ou `details`.
  `details` traz só nomes de campo.
- Dependência nova: versão **exata**, publicada há ≥ 14 dias, CJS no `apps/api` (guia §3.10).
  Já avaliadas: `luxon@3.7.2`, `@types/luxon@3.7.6`.
- Identificadores em inglês com os termos do glossário (spec §3). Textos de tela e mensagens
  de erro em pt-BR.
- Testes: `it('[CA-x.y] …')` dentro de `describe('[RN-xx] …')`; instantes por
  `clinicInstant('YYYY-MM-DD HH:mm')`; relógio falso sempre; int/e2e só no
  `agendamento_test`, com `--runInBand`; sem `jest.useFakeTimers()` em int/e2e.
- O lint do `apps/api` roda com `--fix`: depois dele, `git status --short`.
- Next.js 16: ler `apps/web/AGENTS.md` e os docs em `apps/web/node_modules/next/dist/docs/`
  antes de código no `apps/web`. `params`/`searchParams`/`cookies()` são assíncronos.

## Foco da revisão

Entradas que a spec implica, nenhum `CA` cobre e devem ter teste na tarefa dona:

1. **Janela que cruza o ano** (`from=2026-12-28`, `to=2027-01-03`): 01/01/2027 sem início e
   marcado "Confraternização Universal" no calendário. O serviço precisa montar o mapa de
   feriados de **todos** os anos da janela. Dono: Tarefa 12.
2. **Bloqueio com intervalo invertido**: `FULL_DAYS` com `toDate < fromDate` ou `PERIOD`
   com `endAt ≤ startAt` → 400 `VALIDATION_FAILED`, nunca 500 vindo do CHECK do banco. Dono:
   Tarefa 10.
3. **Renomear ou reativar procedimento para um nome já ativo** (`"limpeza"` com `"Limpeza"`
   ativo) → 409 `PROCEDURE_NAME_TAKEN` no `PATCH`, não 500 do índice único. Dono: Tarefa 9.
4. **Disponibilidade com `serviceId` desativado ou inexistente** → 422 `PROCEDURE_INACTIVE`,
   não 500 e não "30 min" silencioso. Dono: Tarefa 12.
5. **Bloqueio `PERIOD` que atravessa a meia-noite** (segunda 09/11 16:00 → terça 10/11
   09:00): segunda sem 16:00 e 16:30, terça sem 08:00 e 08:30, terça 09:00 livre. Dono:
   Tarefa 8.

---

## Mapa de arquivos

```
packages/shared-types/src/
  index.ts · constants.ts · error-codes.ts · scheduling.ts          (T1, T4, T9–T12)
apps/api/
  prisma/schema.prisma · migrations/<ts>_scheduling_enum_values · <ts>_scheduling_schema   (T5)
  prisma/seed.ts · prisma/seed-data.ts                                (T6)
  src/main.ts · src/app.module.ts                                     (T3, T4, T9)
  src/common/configure-app.ts                                         (T3, T4)
  src/common/time/{clinic-time,clock}.ts (+ .spec)                    (T2)
  src/common/errors/{domain-error,error-codes,http-exception.filter}.ts  (T4)
  src/common/http/json-only.middleware.ts                             (T4)
  src/common/prisma/{prisma-errors,advisory-lock}.ts                  (T9, T10)
  src/common/validation/{is-local-date,no-control-chars,is-iso-instant}.ts  (T9, T10)
  src/scheduling/scheduling.module.ts                                 (T6, T9–T12)
  src/scheduling/domain/{statuses,default-working-hours,holidays,intervals,availability,procedure-rules}.ts (+ .spec)  (T5–T9)
  src/scheduling/application/{professional-context,procedures,schedule-config,holiday-overrides,availability,calendar}.service.ts  (T6, T9–T12)
  src/scheduling/infra/{procedure,schedule,holiday-override,appointment-read}.repository.ts  (T9–T12)
  src/scheduling/http/{dentist,public,dto,presenters}/…               (T9–T12)
  test/jest-e2e.json · test/jest-int.json                             (T3)
  test/support/{load-test-env,global-setup,app,db,clock,factories,availability}.ts  (T2, T3, T6, T8)
  test/integration/**/*.int-spec.ts · test/e2e/**/*.e2e-spec.ts       (T5–T13)
apps/web/
  vitest.config.mts · playwright.config.ts · e2e/fatia-1/*.spec.ts    (T14–T17)
  src/app/layout.tsx · src/app/(public)/page.tsx                      (T14)
  src/app/dashboard/{layout,page}.tsx · procedimentos · horario · bloqueios · agenda  (T14–T17)
  src/lib/{clinic-time,api-server,api-errors}.ts (+ .test)            (T14)
  src/components/{procedures,schedule,calendar}/…                    (T15–T17)
```

---

### Tarefa 1: `shared-types` com build real e `typecheck` no monorepo

Receita: guia §8 "Build e scripts"; arquitetura §3.7.

**Arquivos:**
- Modificar: `packages/shared-types/{package.json,tsconfig.json,src/index.ts}`, `turbo.json`,
  `package.json` (raiz), `apps/api/package.json`, `apps/web/package.json`
- Criar: `packages/shared-types/src/constants.ts`

**Contratos (produz):**

```ts
// packages/shared-types/src/constants.ts
export const CLINIC_TIME_ZONE = 'America/Sao_Paulo';
export const PROCEDURE_DURATIONS = [30, 60, 90] as const;           // RN-05
export const DEFAULT_DURATION_MINUTES = 30;                          // RN-04
export const GRID_STEP_MINUTES = 30;                                 // RN-02
export const MANUAL_STEP_MINUTES = 15;
export const MANUAL_MAX_MINUTES = 480;
export const NAME_MIN = 2; export const NAME_MAX = 100;
export const NOTES_MAX = 500; export const REJECTION_MESSAGE_MAX = 500; export const EMAIL_MAX = 254;
export const PROCEDURE_NAME_MAX = 100;
export const BLOCK_REASON_MAX = 200;
export const AVAILABILITY_MAX_DAYS = 31;
```

- `package.json` do pacote: `main: "dist/index.js"`, `types: "dist/index.d.ts"`, scripts
  `build: "tsc -p tsconfig.json"`, `dev: "tsc -w -p tsconfig.json"`,
  `typecheck: "tsc --noEmit -p tsconfig.json"`, `zod` exato `3.25.76`.
- `tsconfig.json`: `module: "CommonJS"`, `moduleResolution: "Node10"`, `declaration: true`,
  `outDir: "dist"`, `rootDir: "src"`.
- `"@sistema-agendamento/shared-types": "workspace:*"` em `apps/api` e `apps/web`.
- `typecheck` em cada pacote: api `tsc --noEmit -p tsconfig.json`; web
  `next typegen && tsc --noEmit`. Turbo: tarefa `typecheck` com `dependsOn: ["^build"]` e
  `dev` com `dependsOn: ["^build"]`. Raiz: `"typecheck": "turbo run typecheck"`.

**Verificação (testador):**

- [ ] `pnpm install` sem erro.
- [ ] `pnpm --filter @sistema-agendamento/shared-types build` cria
      `packages/shared-types/dist/index.js` e `dist/index.d.ts` (`ls`). `dist/` não aparece no
      `git status`.
- [ ] `node -e "console.log(require('@sistema-agendamento/shared-types').CLINIC_TIME_ZONE)"`,
      rodado em `apps/api`, imprime `America/Sao_Paulo`.
- [ ] `pnpm typecheck` passa nos 3 pacotes.
- [ ] `pnpm build` e `pnpm lint` passam; `git status --short` mostra só os arquivos da
      tarefa.
- [ ] Commit: `chore: build real do shared-types e typecheck no monorepo`.

---

### Tarefa 2: Tempo — Luxon, `clinic-time.ts` e `Clock` (api)

Receita: guia §3.10 (dependência) e §3.3; arquitetura §2.12.

**Arquivos:**
- Criar: `apps/api/src/common/time/clinic-time.ts` (+ `.spec.ts`),
  `apps/api/src/common/time/clock.ts`, `apps/api/test/support/clock.ts`
- Modificar: `apps/api/package.json` (`luxon@3.7.2`, `@types/luxon@3.7.6` dev, `-E`),
  `apps/api/eslint.config.mjs` (`no-restricted-imports` de `luxon` fora de `clinic-time.ts`)

**Contratos (produz):**

```ts
// common/time/clinic-time.ts — único importador de luxon
export type LocalDate = string;                                    // 'YYYY-MM-DD'
export { CLINIC_TIME_ZONE } from '@sistema-agendamento/shared-types';
export function isValidLocalDate(s: string): boolean;              // formato + data real (2026-02-30 → false)
export function localDateOf(instant: Date, tz?: string): LocalDate;
export function localMinuteOf(instant: Date, tz?: string): number; // 0..1439
export function dayOfWeekOf(date: LocalDate): number;              // 0 = domingo
export function instantAt(date: LocalDate, minute: number, tz?: string): Date;  // 0..1440
export function startOfLocalDay(date: LocalDate, tz?: string): Date;
export function addLocalDays(date: LocalDate, n: number): LocalDate;
export function eachLocalDate(from: LocalDate, to: LocalDate): LocalDate[];       // inclusivo
export function daysBetweenInclusive(from: LocalDate, to: LocalDate): number;
export function localDateToDbDate(date: LocalDate): Date;          // meia-noite UTC (@db.Date)
export function dbDateToLocalDate(d: Date): LocalDate;

// common/time/clock.ts
export interface Clock { now(): Date }
export const CLOCK = Symbol('CLOCK');
export class SystemClock implements Clock { now(): Date }          // único Date.now()/new Date() fora de testes

// test/support/clock.ts
export class FixedClock implements Clock { current: Date; now(): Date; advance(minutes: number): void }
export function clinicInstant(local: string /* 'YYYY-MM-DD HH:mm' */, tz?: string): Date;
export const BASE_NOW: Date;                                       // clinicInstant('2026-11-01 12:00')
```

`instantAt` monta a data a partir dos **campos locais** (`DateTime.fromObject({ year, month,
day, hour, minute }, { zone })`), nunca com "meia-noite + N minutos" (num dia de troca de
horário isso desloca a hora). `minute = 1440` → 00:00 do dia seguinte. Hora inexistente
(salto do horário de verão) segue o padrão do Luxon (avança), documentado no comentário.

**Testes de aceite (testador)** — `clinic-time.spec.ts`, sem tag de `CA` (apoio do CA-1.17):

```ts
expect(instantAt('2026-11-09', 480).toISOString()).toBe('2026-11-09T11:00:00.000Z');
expect(instantAt('2026-11-20', 1440).toISOString()).toBe('2026-11-21T03:00:00.000Z');
expect(instantAt('2026-11-01', 480, 'America/New_York').toISOString()).toBe('2026-11-01T13:00:00.000Z');
expect(instantAt('2026-10-31', 480, 'America/New_York').toISOString()).toBe('2026-10-31T12:00:00.000Z');
expect(localDateOf(new Date(Date.UTC(2026, 10, 10, 2, 59)))).toBe('2026-11-09');   // 23:59 em SP
expect(dayOfWeekOf('2026-11-09')).toBe(1);
expect(eachLocalDate('2026-12-30', '2027-01-02')).toEqual(['2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
expect(daysBetweenInclusive('2026-11-01', '2026-12-01')).toBe(31);
expect(isValidLocalDate('2026-02-30')).toBe(false);
expect(dbDateToLocalDate(localDateToDbDate('2026-12-08'))).toBe('2026-12-08');
expect(localDateToDbDate('2026-12-08').toISOString()).toBe('2026-12-08T00:00:00.000Z');
// clinicInstant
expect(clinicInstant('2026-11-09 08:00').toISOString()).toBe('2026-11-09T11:00:00.000Z');
```

Mais um teste que roda `localMinuteOf`/`instantAt` com `process.env.TZ` em `UTC` e em
`Asia/Tokyo` e confere o mesmo resultado (restaurar `TZ` no `afterEach`).

**Verificação:** `pnpm --filter api test -- clinic-time` verde; `pnpm lint` com um import de
`luxon` de teste fora do helper acusa erro (conferir e remover); `pnpm typecheck`. ADR: a
022 já cobre a dependência (marcar a versão instalada se divergir). Commit:
`feat: helper de fuso da clínica e Clock injetável`.

---

### Tarefa 3: Infraestrutura de teste da API e `configureApp`

Receita: guia §4.2, §4.4, §4.5 e §8 "Infraestrutura de teste"; ADR 033.

**Arquivos:**
- Criar: `apps/api/src/common/configure-app.ts`, `apps/api/test/jest-int.json`,
  `apps/api/test/support/{load-test-env,global-setup,app,db}.ts`
- Modificar: `apps/api/src/main.ts`, `apps/api/test/jest-e2e.json`, `apps/api/package.json`
  (scripts), `apps/api/test/{app,auth,appointment-overlap}.e2e-spec.ts` (tirar o `dotenv` do
  topo; usar `createTestApp`), `apps/api/.env.test.example` (+ `CORS_ORIGIN`,
  `SCHEDULER_ENABLED=false`, `SEED_DENTIST_EMAIL`, `SEED_DENTIST_PASSWORD`),
  `apps/api/.env.example` (+ `TZ=UTC`)

**Contratos (produz):**

```ts
// src/common/configure-app.ts — chamado pelo main.ts e pelos testes
export function configureApp(app: NestExpressApplication): void;
//  falha se CORS_ORIGIN ausente; trust proxy 1 (com o comentário atual da ADR 018);
//  helmet; cookieParser; enableCors({ origin, credentials: true }); ValidationPipe global
//  (whitelist, forbidNonWhitelisted, transform). O main.ts mantém bufferLogs, useLogger,
//  enableShutdownHooks e listen.

// test/support/app.ts
export interface TestApp { app: NestExpressApplication; prisma: PrismaService; clock: FixedClock }
export async function createTestApp(opts?: { clock?: FixedClock }): Promise<TestApp>;  // overrideProvider(CLOCK)
export async function loginAsDentist(app: NestExpressApplication, email?: string, password?: string): Promise<string[]>; // Set-Cookie

// test/support/db.ts
export async function truncateAll(prisma: PrismaClient): Promise<void>;
//  TRUNCATE de todas as tabelas do schema public, exceto _prisma_migrations, lidas de
//  pg_tables (assim a lista não precisa mudar a cada migration). RESTART IDENTITY CASCADE.
```

- `load-test-env.ts`: `config({ path: resolve(__dirname, '../../.env.test') })`.
- `global-setup.ts`: carrega o `.env.test`; aborta com mensagem clara se o nome do banco da
  `DATABASE_URL` não termina em `_test`; roda `prisma migrate deploy` (via `execSync` com
  `env` do teste).
- `jest-int.json`: como o `jest-e2e.json`, com `testRegex: ".int-spec.ts$"`. Os dois com
  `setupFiles: ["<rootDir>/test/support/load-test-env.ts"]` e `globalSetup`.
- Scripts: `test:e2e: jest --config ./test/jest-e2e.json --runInBand`,
  `test:int: jest --config ./test/jest-int.json --runInBand --passWithNoTests`.
- `CLOCK` provido no `AppModule` com `SystemClock`, ou num `TimeModule` global em
  `common/time/` (escolha do implementador; tem que ser sobrescrevível).

**Testes de aceite (testador):**
- `test/integration/support/global-setup.int-spec.ts`: chamar a função de validação do nome
  do banco com `.../agendamento_dev` → lança; com `.../agendamento_test` → não lança.
  Exportar essa função do `global-setup.ts`.
- `test/e2e/configure-app.e2e-spec.ts`: `GET /` responde com o cabeçalho
  `x-content-type-options: nosniff` (helmet ativo); `POST /auth/login` com corpo
  `{ email, password, extra: 1 }` → 400 (`forbidNonWhitelisted` ativo nos testes).
- Os 3 e2e existentes passam sem `dotenv` no topo.

**Verificação:** `pnpm --filter api test:int`, `pnpm --filter api test:e2e`,
`pnpm --filter api test`, `pnpm typecheck`, `pnpm lint` + `git status --short`. Subir a API
(`pnpm --filter api dev`), conferir `GET /` e derrubar. Commit:
`test: suites int/e2e com configureApp, globalSetup e truncamento`.

---

### Tarefa 4: Modelo de erro e CSRF por `Content-Type`

Receita: guia §3.11; arquitetura §2.5, §10; ADR 024, ADR 032. Critério: **CA-3.33** (E),
liberado para a fatia 1 pelo guia §6.

**Arquivos:**
- Criar: `packages/shared-types/src/error-codes.ts`,
  `apps/api/src/common/errors/{domain-error,error-codes,http-exception.filter}.ts`,
  `apps/api/src/common/http/json-only.middleware.ts`,
  `apps/api/test/e2e/csrf-content-type.e2e-spec.ts`, `apps/api/test/e2e/error-shape.e2e-spec.ts`
- Modificar: `apps/api/src/common/configure-app.ts`, `docs/architecture/arquitetura.md` §2.5
  (só se algo divergir)

**Contratos (produz):**

```ts
// shared-types/src/error-codes.ts — só os códigos da fatia 1; as fatias seguintes acrescentam
export type ErrorCode =
  | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PROCEDURE_NAME_TAKEN' | 'INVALID_DURATION' | 'PROCEDURE_INACTIVE' | 'NOT_A_HOLIDAY';
export interface ApiErrorBody { statusCode: number; error: string; code: ErrorCode; message: string; details?: Record<string, unknown> }

// api/common/errors/error-codes.ts
export const ERROR_STATUS: Record<ErrorCode, number>;   // 400, 404, 415, 409, 422, 422, 422
export const ERROR_MESSAGE: Record<ErrorCode, string>;  // pt-BR, sem dado digitado

// api/common/errors/domain-error.ts
export class DomainError extends Error {
  constructor(readonly code: ErrorCode, readonly details?: Record<string, unknown>);
}
export function errorBody(code: ErrorCode, details?: Record<string, unknown>): ApiErrorBody;

// api/common/errors/http-exception.filter.ts — @Catch() global, registrado no configureApp
//  DomainError → ERROR_STATUS[code] + errorBody. HttpException (guard 401, throttler 429,
//  rota inexistente 404) → resposta padrão do Nest, sem mudança. Outro erro → 500
//  { statusCode: 500, error: 'Internal Server Error', message: 'Erro interno.' } e log só
//  com err.name e a rota.

// ValidationPipe com exceptionFactory → DomainError('VALIDATION_FAILED', { fields: string[] })
//  (caminhos dos campos, nunca os valores).

// api/common/http/json-only.middleware.ts — Express, registrado no configureApp
export function jsonOnly(req, res, next): void;
//  Métodos POST/PUT/PATCH/DELETE: se o cabeçalho Content-Type existe e o media type
//  (antes do ';', minúsculo, sem espaços) ≠ 'application/json' → 415 com
//  errorBody('UNSUPPORTED_MEDIA_TYPE'), escrito direto no res. Sem Content-Type → segue.
```

**Testes de aceite (testador):**

```ts
describe('[CSRF] spec 10.1 — mutação só aceita JSON', () => {
  // CA-3.33: Dado qualquer rota de mutação da API, quando chega com Content-Type form-urlencoded,
  // multipart ou text/plain, então 415 e nada muda. Dado POST /auth/refresh sem corpo e sem
  // Content-Type, então funciona como hoje.
  it.each([
    ['application/x-www-form-urlencoded', 'email=a%40b.com&password=x'],
    ['multipart/form-data; boundary=x', '--x--'],
    ['text/plain', '{"email":"a@b.com","password":"x"}'],
  ])('[CA-3.33] POST /auth/login com %s → 415', async (type, body) => {
    const res = await request(server).post('/auth/login').set('Content-Type', type).send(body);
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ statusCode: 415, error: 'Unsupported Media Type',
      code: 'UNSUPPORTED_MEDIA_TYPE', message: expect.any(String) });
  });
  it('[CA-3.33] POST /auth/logout autenticado com text/plain → 415 e a sessão continua válida', …);
  //   depois do 415, GET /auth/me com os mesmos cookies → 200 ("nada muda").
  it('[CA-3.33] POST /auth/refresh sem corpo e sem Content-Type, com o cookie de um login → 201', …);
});
```

`error-shape.e2e-spec.ts` (sem `CA`): `POST /auth/login` com `{ email: 1 }` → 400 com
`code: 'VALIDATION_FAILED'`, `details.fields` contendo `'email'` e `'password'`, e o corpo
sem o valor `1`. Unit em `error-codes.spec.ts`: todo `ErrorCode` tem status e mensagem
(`Object.keys` iguais).

**Verificação:** `pnpm --filter api test:e2e -- -t "CA-3.33]"` e a suíte e2e inteira
(inclusive `auth.e2e-spec.ts`), `pnpm --filter api test`, `pnpm typecheck`, `pnpm lint`.
Commit: `feat: modelo de erro com code estável e 415 para mutação não JSON`.

---

### Tarefa 5: Schema e migrations da spec §6

Receita: guia §3.5; arquitetura §4.1, §4.2; ADR 020. Critério: **CA-1.13** (U + I).

**Arquivos:**
- Modificar: `apps/api/prisma/schema.prisma`
- Criar: `apps/api/prisma/migrations/<ts>_scheduling_enum_values/`,
  `apps/api/prisma/migrations/<ts>_scheduling_schema/`,
  `apps/api/src/scheduling/domain/statuses.ts` (+ `.spec.ts`),
  `apps/api/test/integration/scheduling/constraints.int-spec.ts`
- Modificar: `apps/api/test/appointment-overlap.e2e-spec.ts` (campos novos obrigatórios:
  `source`, `contactName`)

**Contratos (produz):**
- Schema exatamente como a arquitetura §4.1 (enums com valores novos **no fim**,
  `AppointmentEventType`, `ScheduleBlock`, `HolidayOverride`, `AppointmentEvent`,
  `Notification`; sem `ScheduleException`/`ExceptionType`; `Patient.email String?`;
  `Appointment.serviceId String?` com `onDelete: Restrict`; `cancellationToken String?
  @unique` **sem** default; índices `(status, startAt)` e `(status, closedAt)`).
- **M1** `scheduling_enum_values`: só `ADD VALUE` de `REJECTED`, `EXPIRED` (status) e
  `SYSTEM` (`CancelledBy`).
- **M2** `scheduling_schema`: o resto, gerado com `--create-only`, mais o SQL à mão da
  arquitetura §4.2 no fim (constraint com `NOT IN ('CANCELLED','REJECTED','EXPIRED')`,
  CHECKs `appointment_start_before_end`, `schedule_block_start_before_end`,
  `working_hours_valid_range`, índice `service_active_name_ci_key`). Conferir se o SQL gerado
  não tem `DROP` de objeto feito à mão.

```ts
// scheduling/domain/statuses.ts — espelha o predicado da constraint (spec 6.3)
export const NON_OCCUPYING_STATUSES = ['CANCELLED', 'REJECTED', 'EXPIRED'] as const;
export const OCCUPYING_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const;
export type AppointmentStatusName = (typeof OCCUPYING_STATUSES)[number] | (typeof NON_OCCUPYING_STATUSES)[number];
export function isOccupying(status: AppointmentStatusName): boolean;
```

**Testes de aceite (testador):**

```ts
describe('[RN-13] status ocupantes', () => {
  // CA-1.13: Dado agendamentos CANCELLED, REJECTED ou EXPIRED no horário, então eles não ocupam;
  // dado PENDING, CONFIRMED, COMPLETED ou NO_SHOW, ocupam.
  it.each(['PENDING','CONFIRMED','COMPLETED','NO_SHOW'])('[CA-1.13] %s ocupa', s => expect(isOccupying(s)).toBe(true));
  it.each(['CANCELLED','REJECTED','EXPIRED'])('[CA-1.13] %s não ocupa', s => expect(isOccupying(s)).toBe(false));
});
```

`constraints.int-spec.ts` (Postgres real, `truncateAll` no `beforeEach`):
- `[CA-1.13]` para cada um dos 7 status: inserir A `CONFIRMED` 09:00–10:00 de segunda
  09/11 e B com o status da vez em 09:30–10:30. Se o status é ocupante, o insert de B
  rejeita com `PrismaClientUnknownRequestError` cuja `message` contém
  `no_overlapping_appointments`; se não, B grava. Prova que `statuses.ts` bate com o
  predicado.
- Sem tag: `startAt = endAt` em `Appointment` e em `ScheduleBlock` → erro citando o CHECK;
  `WorkingHours` com `endMinute = 1441` → erro citando `working_hours_valid_range`.
- Sem tag: dois `Service` ativos `"Limpeza"` e `"limpeza"` → registrar **a forma real** do
  erro (código `P2002`? `meta.target`?) num `expect` explícito. A Tarefa 9 usa essa forma
  para mapear `PROCEDURE_NAME_TAKEN`. Um inativo com o mesmo nome grava.
- Sem tag: `HolidayOverride` duplicado `(professionalId, date)` → `P2002`.

**Verificação:** `pnpm --filter api exec prisma migrate dev` aplica M1 e M2 no dev;
`pnpm --filter api exec prisma migrate status` limpo; `pnpm --filter api test:int`;
`pnpm --filter api test:e2e` (o overlap continua verde); `pnpm typecheck`. Commit:
`feat: schema da agenda (spec 6) com constraint e checks`.

---

### Tarefa 6: Seed, `ProfessionalContextService` e factories de teste

Receita: guia §4.4 (factories); spec §6.9; arquitetura §12, item 2. Critério: **CA-1.20** (I).

**Arquivos:**
- Criar: `apps/api/src/scheduling/domain/default-working-hours.ts`,
  `apps/api/prisma/seed-data.ts`, `apps/api/src/scheduling/scheduling.module.ts`,
  `apps/api/src/scheduling/application/professional-context.service.ts`,
  `apps/api/test/support/factories.ts`, `apps/api/test/integration/scheduling/seed.int-spec.ts`,
  `apps/api/test/integration/scheduling/professional-context.int-spec.ts`
- Modificar: `apps/api/prisma/seed.ts` (só chama `runSeed`), `apps/api/src/app.module.ts`

**Contratos (produz):**

```ts
// domain/default-working-hours.ts — tabela da RN-01, fonte única para seed e testes
export interface WeeklyHoursRow { dayOfWeek: number; startMinute: number; endMinute: number }
export const DEFAULT_WEEKLY_HOURS: readonly WeeklyHoursRow[];   // 9 linhas: seg 480–660, 810–1020; ter 480–660, 810–990;
                                                                //  qua = seg; qui = ter; sex 480–630

// prisma/seed-data.ts
export const SEED_PROFESSIONAL_NAME = 'Dra. Eloísa Paiva';
export async function runSeed(prisma: PrismaClient, env: { email: string; password: string }): Promise<void>;
//  upsert do User (como hoje); upsert do Professional por userId (nome acima);
//  createMany das 9 linhas SÓ se o Professional não tiver nenhuma WorkingHours. Sem procedimentos
//  (lista da cliente em aberto, spec 12.1).

// application/professional-context.service.ts
@Injectable() export class ProfessionalContextService {
  forUser(userId: string): Promise<string>;   // professionalId; usuário sem Professional → Error (500, erro de configuração)
  forPublic(): Promise<string>;               // a única Professional ligada a User DENTIST; 0 ou >1 → Error
}

// test/support/factories.ts
export const DENTIST_EMAIL: string; export const DENTIST_PASSWORD: string;
export async function seedProfessional(prisma): Promise<{ userId: string; professionalId: string }>; // = runSeed com as credenciais de teste
export async function makeService(prisma, p: { professionalId: string; name?: string; durationMinutes?: number; active?: boolean }): Promise<{ id: string }>;
export async function makePatient(prisma, p?: { phone?: string; name?: string }): Promise<{ id: string }>;
export async function makeAppointment(prisma, p: { professionalId: string; startAt: Date; durationMinutes?: number;
  status?: AppointmentStatus; serviceId?: string | null; createdAt?: Date; closedAt?: Date | null;
  source?: AppointmentSource; contactName?: string; contactEmail?: string | null }): Promise<{ id: string }>;
export async function makeBlock(prisma, p: { professionalId: string; startAt: Date; endAt: Date; reason?: string }): Promise<{ id: string }>;
export async function makeHolidayOverride(prisma, p: { professionalId: string; date: LocalDate }): Promise<{ id: string }>;
```

**Testes de aceite (testador)** — `seed.int-spec.ts`:

```ts
describe('[RN-01] horário semanal pré-carregado pelo seed', () => {
  // CA-1.20: Dado o seed rodado duas vezes, então existem exatamente 9 linhas de WorkingHours e um
  // Professional ligado ao usuário. Dado um horário editado e o seed rodado de novo, então a edição permanece.
  it('[CA-1.20] seed duas vezes → 9 linhas e um Professional ligado ao usuário', …);
  //   expect(await prisma.workingHours.count()).toBe(9); expect(await prisma.professional.count()).toBe(1);
  //   professional.userId === user.id; as 9 linhas (dayOfWeek, startMinute, endMinute) ordenadas === DEFAULT_WEEKLY_HOURS ordenado
  it('[CA-1.20] edição do horário sobrevive a um novo seed', …);
  //   update de uma linha (sexta endMinute 630 → 600) → runSeed → a linha continua 600 e o total é 9
});
```

`professional-context.int-spec.ts` (sem tag): `forUser` devolve o id; `forPublic` com um
Professional → id; sem nenhum → rejeita; com dois ligados a `DENTIST` → rejeita.

**Verificação:** `pnpm --filter api test:int -- -t "CA-1.20]"`, a suíte int inteira,
`pnpm --filter api db:seed` duas vezes no dev (sem erro), `pnpm typecheck`, `pnpm lint`.
Commit: `feat: seed com Professional e horário da RN-01; contexto da profissional`.

---

### Tarefa 7: Calendário de feriados de BH

Receita: guia §3.3; spec §9.4; arquitetura §2.3. Critérios: **CA-1.10** (U); parte de
feriado do **CA-1.8** e do **CA-1.9** (U).

**Arquivos:** criar `apps/api/src/scheduling/domain/holidays.ts` (+ `.spec.ts`).

**Contratos (produz):**

```ts
export function easterSunday(year: number): LocalDate;                  // Meeus/Jones/Butcher
export function clinicHolidays(year: number): Map<LocalDate, string>;   // nacionais + BH + seg/ter de Carnaval
export function holidaysForDates(dates: LocalDate[]): Map<LocalDate, string>;  // une os anos que aparecem
```

Nomes exatos (aparecem no painel):

| Data | Nome |
|---|---|
| 01/01 | Confraternização Universal |
| Páscoa − 48 | Carnaval (segunda-feira) |
| Páscoa − 47 | Carnaval (terça-feira) |
| Páscoa − 2 | Sexta-feira da Paixão |
| 21/04 | Tiradentes |
| 01/05 | Dia do Trabalho |
| Páscoa + 60 | Corpus Christi |
| 15/08 | Assunção de Nossa Senhora |
| 07/09 | Independência do Brasil |
| 12/10 | Nossa Senhora Aparecida |
| 02/11 | Finados |
| 15/11 | Proclamação da República |
| 20/11 | Dia Nacional de Zumbi e da Consciência Negra |
| 08/12 | Imaculada Conceição |
| 25/12 | Natal |

Dois feriados na mesma data → nomes unidos por `" / "`, na ordem da tabela. A Quarta-feira
de Cinzas **não** entra (RN-09).

**Testes de aceite (testador):**

```ts
describe('[RN-08] feriados de BH (spec 9.4)', () => {
  // CA-1.10 (texto da spec acima do it)
  it.each([[2026,'2026-04-05'],[2027,'2027-03-28'],[2028,'2028-04-16'],[2029,'2029-04-01'],[2030,'2030-04-21']])
    ('[CA-1.10] Páscoa de %i = %s', (y, d) => expect(easterSunday(y)).toBe(d));
  it.each(['2026-04-03','2027-03-26','2028-04-14','2029-03-30','2030-04-19'])
    ('[CA-1.10] Sexta-feira Santa %s', d => expect(clinicHolidays(+d.slice(0,4)).get(d)).toBe('Sexta-feira da Paixão'));
  it.each(['2026-02-17','2027-02-09','2028-02-29'])
    ('[CA-1.10] terça de Carnaval %s', d => expect(clinicHolidays(+d.slice(0,4)).get(d)).toBe('Carnaval (terça-feira)'));
  it.each(['2026-06-04','2027-05-27','2028-06-15'])
    ('[CA-1.10] Corpus Christi %s', d => expect(clinicHolidays(+d.slice(0,4)).get(d)).toBe('Corpus Christi'));
  // CA-1.8 (parte de feriado)
  it.each([['2026-11-02','Finados'],['2026-11-20','Dia Nacional de Zumbi e da Consciência Negra'],['2026-12-25','Natal'],
    ['2026-12-08','Imaculada Conceição'],['2027-03-26','Sexta-feira da Paixão'],['2027-05-27','Corpus Christi'],
    ['2028-08-15','Assunção de Nossa Senhora']])('[CA-1.8] %s é feriado: %s', (d, n) => expect(clinicHolidays(+d.slice(0,4)).get(d)).toBe(n));
  // CA-1.9 (parte de feriado)
  it('[CA-1.9] 08/02 e 09/02/2027 são Carnaval; 10/02/2027 (Cinzas) não é feriado', …);
  it('2026 tem exatamente 15 feriados', () => expect(clinicHolidays(2026).size).toBe(15));
  it('12/12 (aniversário de BH) não é feriado', () => expect(clinicHolidays(2026).has('2026-12-12')).toBe(false));
});
```

**Verificação:** `pnpm --filter api test -- holidays`, `pnpm typecheck`, `pnpm lint`.
Commit: `feat: calendário de feriados de BH com Páscoa calculada`.

---

### Tarefa 8: Motor de horários livres

Receita: guia §3.3; arquitetura §2.3; spec §4.1. Critérios (U): **CA-1.1, 1.2, 1.3, 1.4,
1.6, 1.7, 1.8, 1.9, 1.11, 1.12, 1.14, 1.16, 1.17, 1.23, 1.24**.

**Arquivos:**
- Criar: `apps/api/src/scheduling/domain/{intervals,availability,procedure-rules}.ts`
  (+ `.spec.ts`), `apps/api/test/support/availability.ts`

**Contratos (produz):**

```ts
// domain/intervals.ts
export interface Interval { start: Date; end: Date }                 // semiaberto
export function overlaps(a: Interval, b: Interval): boolean;         // a.start < b.end && b.start < a.end

// domain/procedure-rules.ts
export function resolveDurationMinutes(procedure: { durationMinutes: number } | null): number;  // null → 30 (RN-04)
export function isValidProcedureDuration(minutes: number): boolean;  // ∈ PROCEDURE_DURATIONS (RN-05)

// domain/availability.ts
export interface AvailabilityInput {
  fromDate: LocalDate; toDate: LocalDate;
  weeklyHours: readonly WeeklyHoursRow[];
  blocks: Interval[]; occupied: Interval[];
  holidays: Map<LocalDate, string>; holidayOverrides: Set<LocalDate>;
  durationMinutes: number; now: Date; timeZone: string; gridStepMinutes?: number;   // padrão GRID_STEP_MINUTES
}
export function computeAvailableStarts(i: AvailabilityInput): Map<LocalDate, Date[]>;  // toda data do intervalo é chave (lista vazia se nada)

// test/support/availability.ts
export const RN01_HOURS = DEFAULT_WEEKLY_HOURS;
export function availabilityInput(o: Partial<AvailabilityInput>): AvailabilityInput;
//  padrões: weeklyHours RN01_HOURS, blocks [], occupied [], holidays new Map(), holidayOverrides new Set(),
//  durationMinutes 30, now BASE_NOW, timeZone CLINIC_TIME_ZONE; fromDate/toDate obrigatórios no uso
export function toClinicHHmm(d: Date, tz?: string): string;
```

Regra: para cada data local `D` do intervalo, se `D` é feriado e não está em
`holidayOverrides`, nada. Senão, para cada linha de `weeklyHours` com
`dayOfWeek = dayOfWeekOf(D)`, os candidatos são `instantAt(D, startMinute + k·step)`. Um
candidato `s` entra se:
- `s > now`;
- `s + duração ≤ instantAt(D, endMinute)`;
- `[s, s + duração)` não sobrepõe nenhum bloqueio nem ocupado.

A lista de cada dia sai ordenada.

**Testes de aceite (testador)** — `availability.spec.ts`. Um `describe('[RN-xx] …')` por
regra, o texto do critério acima de cada `it` e a lista inteira com `toEqual`:

| Tag | Dado / Quando | Então (`toClinicHHmm` do dia) |
|---|---|---|
| CA-1.1 | 09/11, 60 min | `08:00 08:30 09:00 09:30 10:00 13:30 14:00 14:30 15:00 15:30 16:00` |
| CA-1.2 | 10/11, 60 min | tarde = `13:30 14:00 14:30 15:00 15:30` |
| CA-1.3 | 13/11, 30 min / 90 min | `08:00 08:30 09:00 09:30 10:00` / `08:00 08:30 09:00` |
| CA-1.4 | 90 min, 09/11 e 10/11 | seg `08:00 08:30 09:00 09:30 13:30 14:00 14:30 15:00 15:30`; ter `08:00 08:30 09:00 09:30 13:30 14:00 14:30 15:00` |
| CA-1.6 | `resolveDurationMinutes(null)` | `30`; e o motor com essa duração em 09/11 dá a grade de 30 min (manhã `08:00`…`10:30`, tarde `13:30`…`16:30`) |
| CA-1.7 | 14/11 e 15/11 | `[]` e `[]` |
| CA-1.8 | cada data da spec, `holidays = holidaysForDates([...])`, `now = BASE_NOW` | `[]` em todas |
| CA-1.9 | 08/02, 09/02 e 10/02/2027 com feriados | `[]`, `[]`; 10/02 = grade de quarta (30 min) |
| CA-1.11 | ocupado 09:00–10:00 em 09/11, 60 min | `08:00 10:00 13:30 … 16:00` (sem 08:30, 09:00, 09:30) |
| CA-1.12 | ocupado 09:00–09:45 em 09/11, 30 min | manhã `08:00 08:30 10:00 10:30` |
| CA-1.14 | bloqueio 09/11 13:30–24:00 (`clinicInstant('2026-11-10 00:00')`), 60 min / bloqueio 09:15–09:45, 30 min | só a manhã de CA-1.1 / manhã `08:00 08:30 10:00 10:30` |
| CA-1.16 | `now = clinicInstant('2026-11-09 09:10')`, 30 min | `09:30 10:00 10:30 13:30 … 16:30` |
| CA-1.17 | (a) mesmo input com `process.env.TZ` = `UTC` e `America/Sao_Paulo` | resultados `toEqual` (restaurar `TZ`) |
| CA-1.17 | (b) `timeZone: 'America/New_York'`, todo dia 480–540, 31/10–02/11/2026, 30 min, `now = clinicInstant('2026-10-30 00:00','America/New_York')` | por dia `08:00 08:30` local; ISO: 31/10 `12:00Z 12:30Z`, 01/11 e 02/11 `13:00Z 13:30Z` |
| CA-1.23 | 08/12/2026 feriado + `holidayOverrides = {'2026-12-08'}`, 30 min | grade normal de terça: `08:00`…`10:30`, `13:30`…`16:00` |
| CA-1.24 | idem + bloqueio 13:30–16:30 de 08/12 | só a manhã |

Foco da revisão, item 5 (sem tag, `describe('[RN-03] …')`): bloqueio
`clinicInstant('2026-11-09 16:00')`–`clinicInstant('2026-11-10 09:00')`, 30 min → segunda
sem `16:00` e `16:30`; terça começa em `09:00`.

Unit de `procedure-rules`: `isValidProcedureDuration` verdadeiro para 30/60/90 e falso para
45/120/0.

**Verificação:** `pnpm --filter api test -- availability`, cada critério isolado
(`-t "CA-1.1]"`, `-t "CA-1.17]"`), `pnpm typecheck`, `pnpm lint`. Revisor confere que
`availability.ts` não importa `luxon` nem chama `new Date()`. Commit:
`feat: motor de horários livres (RN-01..RN-09, RN-46)`.

---

### Tarefa 9: Procedimentos — CRUD da dentista e lista pública

Receitas: guia §3.1, §3.2 (só a rota pública já autorizada), §3.11. Critérios: **CA-1.5**
(E), **CA-1.18** (I + E), **CA-1.19** (E). RN-40, RN-41.

**Arquivos:**
- Criar: `apps/api/src/common/validation/no-control-chars.ts`,
  `apps/api/src/common/prisma/prisma-errors.ts`,
  `apps/api/src/scheduling/application/procedures.service.ts`,
  `apps/api/src/scheduling/infra/procedure.repository.ts`,
  `apps/api/src/scheduling/http/dentist/procedures.controller.ts`,
  `apps/api/src/scheduling/http/public/public-procedures.controller.ts`,
  `apps/api/src/scheduling/http/dto/{create-procedure,update-procedure}.dto.ts`,
  `apps/api/src/scheduling/http/presenters/procedure.presenter.ts`,
  `packages/shared-types/src/scheduling.ts`,
  `apps/api/test/integration/scheduling/procedures.int-spec.ts`,
  `apps/api/test/e2e/scheduling/procedures.e2e-spec.ts`

**Contratos:**

```ts
// shared-types/src/scheduling.ts
export interface ProcedureDto { id: string; name: string; durationMinutes: number; active: boolean }
export interface PublicProcedureDto { id: string; name: string; durationMinutes: number }

// DTOs: Create { name: string (trim no caso de uso; 1..PROCEDURE_NAME_MAX; @NoControlChars); durationMinutes: @IsInt }
//       Update { name?; durationMinutes?; active?: boolean } — sem professionalId (campo extra → 400)

// common/prisma/prisma-errors.ts
export function isOverlapViolation(err: unknown): boolean;                     // ADR 007
export function isUniqueViolation(err: unknown, target: string): boolean;      // forma real confirmada na Tarefa 5

// application/procedures.service.ts
list(professionalId): Promise<ProcedureDto[]>;                 // ativos e inativos; ativos primeiro, depois nome
listPublic(): Promise<PublicProcedureDto[]>;                   // só ativos da forPublic(); por nome
create(professionalId, { name, durationMinutes }): Promise<ProcedureDto>;   // liga o Service à Professional
update(professionalId, id, patch): Promise<ProcedureDto>;      // id fora da profissional → NOT_FOUND
// duração ∉ {30,60,90} → DomainError('INVALID_DURATION') (422); nome ativo repetido (case-insensitive) →
// DomainError('PROCEDURE_NAME_TAKEN') (409), inclusive no PATCH que renomeia ou reativa.
```

Rotas: `GET /procedures`, `POST /procedures` (201), `PATCH /procedures/:id` (200,
`ParseUUIDPipe`), `GET /public/procedures` (`@Public()`, throttle global).

**Testes de aceite (testador):**
- `procedures.e2e-spec.ts`, com `describe('[RN-05] …')` e `describe('[RN-40] …')`:
  - `[CA-1.5]` `POST /procedures {name:'Canal', durationMinutes:120}` → 422,
    `code: 'INVALID_DURATION'`; `service.count()` igual antes e depois.
  - `[CA-1.18]` 45 → 422 `INVALID_DURATION`; 30, 60 e 90 → 201 com o corpo `ProcedureDto`;
    `"Limpeza"` ativo e depois `"limpeza"` → 409 `PROCEDURE_NAME_TAKEN`.
  - `[CA-1.19]` procedimento desativado via `PATCH {active:false}` some de
    `GET /public/procedures` e continua em `GET /procedures` com `active:false`. Com um
    agendamento (factory) que o usa, `GET /calendar` mostra `procedureName` igual ao nome.
    Essa última parte fica **pendente** até a Tarefa 12; o testador a acrescenta lá, no
    mesmo `it`.
  - Foco da revisão, item 3 (sem tag): `PATCH` renomeando para `"LIMPEZA"` com `"Limpeza"`
    ativo → 409; reativar um inativo `"Limpeza"` com outro `"Limpeza"` ativo → 409.
  - Sem tag: `POST /procedures` com `professionalId` no corpo → 400 `VALIDATION_FAILED`.
- `procedures.int-spec.ts`: `[CA-1.18]` o serviço lança `PROCEDURE_NAME_TAKEN` em duas
  criações concorrentes (`Promise.allSettled`) com o mesmo nome em caixas diferentes: um
  sucesso, uma rejeição, uma linha ativa.

**Verificação:** `pnpm --filter api test:e2e -- -t "CA-1.5]"`, `-t "CA-1.18]"`, a suíte e2e
e a int, `pnpm typecheck`, `pnpm lint`. Arquitetura §2.5: conferir as linhas
`PROCEDURE_NAME_TAKEN`/`INVALID_DURATION`. Commit:
`feat: CRUD de procedimentos e lista pública`.

---

### Tarefa 10: Horário semanal (leitura) e bloqueios

Receitas: guia §3.1, §3.5 (CHECK já existe); arquitetura §2.8; ADR 025. Critério:
**CA-1.15** (I + E). RN-42, RN-44 (em parte).

**Arquivos:**
- Criar: `apps/api/src/common/prisma/advisory-lock.ts`,
  `apps/api/src/common/validation/{is-local-date,is-iso-instant}.ts`,
  `apps/api/src/scheduling/application/schedule-config.service.ts`,
  `apps/api/src/scheduling/infra/schedule.repository.ts`,
  `apps/api/src/scheduling/http/dentist/{working-hours,blocks}.controller.ts`,
  `apps/api/src/scheduling/http/dto/{create-block,list-range}.dto.ts`,
  `apps/api/src/scheduling/http/presenters/block.presenter.ts`,
  `apps/api/test/integration/common/advisory-lock.int-spec.ts`,
  `apps/api/test/integration/scheduling/blocks.int-spec.ts`,
  `apps/api/test/e2e/scheduling/blocks.e2e-spec.ts`

**Contratos:**

```ts
// common/prisma/advisory-lock.ts — primeira instrução da transação (arquitetura 2.8)
export async function lockSchedule(tx: Prisma.TransactionClient, professionalId: string): Promise<void>;
//  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('schedule:' || ${professionalId}, 0))`
//  ($executeRaw, não $queryRaw: a função devolve void, e o $queryRaw do Prisma pode não desserializar void.)

// shared-types
export interface WorkingHoursDto { dayOfWeek: number; startMinute: number; endMinute: number }
export interface BlockDto { id: string; startAt: string; endAt: string; reason: string | null; createdAt: string }
export type CreateBlockRequest =
  | { kind: 'FULL_DAYS'; fromDate: string; toDate: string; reason?: string }
  | { kind: 'PERIOD'; startAt: string; endAt: string; reason?: string };

// application/schedule-config.service.ts
listWorkingHours(professionalId): Promise<WorkingHoursDto[]>;          // por dayOfWeek, startMinute
listBlocks(professionalId, from: LocalDate, to: LocalDate): Promise<BlockDto[]>;  // os que intersectam [startOfLocalDay(from), startOfLocalDay(to+1)); por startAt
createBlock(professionalId, req: CreateBlockRequest): Promise<BlockDto>;
//  $transaction: lockSchedule → insert. FULL_DAYS → [instantAt(fromDate,0), instantAt(toDate+1,0)).
//  toDate < fromDate ou endAt ≤ startAt → DomainError('VALIDATION_FAILED', { fields: [...] }).
//  Sem RN-43 nesta fatia (não há agendamentos pela tela).
deleteBlock(professionalId, id): Promise<void>;   // inexistente → NOT_FOUND; log 'block.deleted' { blockId } sem o motivo
```

- DTO de bloqueio: `kind` `@IsIn`; `fromDate`/`toDate` com `@IsLocalDate` (formato + data
  real, via `isValidLocalDate`) e `@ValidateIf(kind === 'FULL_DAYS')`; `startAt`/`endAt`
  com `@IsIsoInstant` (ISO 8601 com `Z` ou offset) e `@ValidateIf(kind === 'PERIOD')`;
  `reason?` ≤ `BLOCK_REASON_MAX`, `@NoControlChars`.
- `list-range.dto.ts`: `from`, `to` com `@IsLocalDate`, reaproveitado pelas Tarefas 10 e
  12. As regras `to ≥ from` e o limite de dias são do caso de uso: aqui ≤ 366 dias, na
  disponibilidade e no calendário `AVAILABILITY_MAX_DAYS`.
- Rotas: `GET /working-hours`; `GET /blocks?from&to`; `POST /blocks` (201);
  `DELETE /blocks/:id` (204).

**Testes de aceite (testador):**
- `blocks.int-spec.ts`, `describe('[RN-42] bloqueio de dia inteiro')`:
  `[CA-1.15]` `createBlock(FULL_DAYS, 2026-11-16..2026-11-20)` → no banco
  `startAt = clinicInstant('2026-11-16 00:00')` (`2026-11-16T03:00:00.000Z`) e
  `endAt = clinicInstant('2026-11-21 00:00')` (`2026-11-21T03:00:00.000Z`). A parte "nenhum
  início nesses dias" fica no e2e da Tarefa 12, com a mesma tag.
- `advisory-lock.int-spec.ts` (sem tag; é o "tech check" da memória): duas transações para a
  mesma profissional. A 1ª pega o lock e espera uma promessa liberada pelo teste; a 2ª chama
  `lockSchedule` e grava em `order[]` quando passa. Asserção: `order` = `['A-commit',
  'B-locked']`. Para profissionais diferentes, a 2ª passa antes do commit da 1ª.
- `blocks.e2e-spec.ts`: `POST /blocks` PERIOD → 201 com `BlockDto`;
  `GET /blocks?from=2026-11-01&to=2026-11-30` lista; `DELETE` → 204, depois 404
  `NOT_FOUND`; `GET /working-hours` → as 9 linhas da RN-01.
- Foco da revisão, item 2 (sem tag): `FULL_DAYS` com `toDate < fromDate`, `PERIOD` com
  `endAt = startAt`, `fromDate: '2026-02-30'` e `startAt` sem fuso (`'2026-11-09T10:00'`) →
  400 `VALIDATION_FAILED`, `scheduleBlock.count()` inalterado.

**Verificação:** `pnpm --filter api test:int -- -t "CA-1.15]"`, as suítes int e e2e,
`pnpm typecheck`, `pnpm lint`. Repetir o `advisory-lock.int-spec.ts` 20× (guia §4.6).
Commit: `feat: leitura do horário semanal e bloqueios com lock por profissional`.

---

### Tarefa 11: Feriados e desbloqueio de feriado

Receitas: guia §3.1, §3.11; spec RN-46. Critério: **CA-1.25** (E).

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/holiday-overrides.service.ts`,
  `apps/api/src/scheduling/infra/holiday-override.repository.ts`,
  `apps/api/src/scheduling/http/dentist/holidays.controller.ts`,
  `apps/api/src/scheduling/http/dto/{create-holiday-override,holidays-query}.dto.ts`,
  `apps/api/test/e2e/scheduling/holidays.e2e-spec.ts`

**Contratos:**

```ts
// shared-types
export interface HolidayDto { date: string; name: string; overridden: boolean }
export interface HolidayOverrideDto { id: string; date: string }

// application/holiday-overrides.service.ts
listHolidays(professionalId, year: number): Promise<HolidayDto[]>;    // clinicHolidays(year) + overrides do ano; por data
override(professionalId, date: LocalDate): Promise<HolidayOverrideDto>;
//  date não é feriado → DomainError('NOT_A_HOLIDAY') (422). Idempotente: a 2ª chamada devolve a mesma linha
//  (createMany skipDuplicates + find, ou captura do P2002). Sem lock (só abre horário — arquitetura 2.8).
undoOverride(professionalId, date: LocalDate): Promise<void>;
//  $transaction: lockSchedule → deleteMany. Idempotente (0 linhas também é 204). Log 'holiday_override.deleted' { date }.
//  Agendamentos do dia não mudam (RN-46).
```

Rotas: `GET /holidays?year=` (`@IsInt @Min(2000) @Max(2100)`, `@Type(() => Number)`),
`POST /holiday-overrides { date }` (201 nas duas chamadas, mesmo corpo),
`DELETE /holiday-overrides/:date` (204; `:date` inválido → 400).

Ajustes da revisão (2026-11-05): o `POST` aceita só anos `HOLIDAY_YEAR_MIN`..`HOLIDAY_YEAR_MAX`
(2000–2100, constantes do `shared-types`, as mesmas do `GET`; fora → 400 `fields: ['date']`),
para não gravar desbloqueio que nenhuma listagem mostra. Data passada continua aceita (sem RN).
O `upsert` é um único `INSERT … ON CONFLICT … RETURNING` (`$queryRaw` com template), para um
`DELETE` concorrente não gerar 500. O log `holiday_override.deleted` só sai quando apagou linha.

**Testes de aceite (testador)** — `holidays.e2e-spec.ts`, `describe('[RN-46] …')`:
- `[CA-1.25]` `POST /holiday-overrides {date:'2026-11-10'}` → 422 `NOT_A_HOLIDAY`, contagem
  inalterada. `{date:'2026-12-08'}` duas vezes → as duas 201 com corpos `toEqual`;
  `holidayOverride.count()` = 1.
- Sem tag: `GET /holidays?year=2026` → 15 itens; `2026-12-08` com `overridden: true` depois
  do POST e `false` depois do `DELETE`; o `DELETE` repetido → 204.
- Sem tag: `GET /holidays?year=1999` → 400.

**Verificação:** `pnpm --filter api test:e2e -- -t "CA-1.25]"`, a suíte e2e,
`pnpm typecheck`, `pnpm lint`. Commit: `feat: lista de feriados e desbloqueio de feriado`.

---

### Tarefa 12: Disponibilidade pública e calendário do painel

Receitas: guia §3.1, §3.2; arquitetura §5, §8. Critérios (E): **CA-1.6, 1.8, 1.15
(parte), 1.21, 1.23, 1.26, 3.25**; complemento do **CA-1.19**.

> **Conflito de documentos resolvido pela spec** (precedência 1 > 3): o CA-1.19 ("continua
> aparecendo em agendamentos que já o usam") e o CA-1.26 ("o painel o destaca como 'em
> feriado'") exigem que o `GET /calendar` já devolva agendamentos na fatia 1. A arquitetura
> §5 diz "agendamentos a partir da fatia 2". Esta tarefa inclui a leitura mínima abaixo e
> corrige a arquitetura §5 e §7.1.

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/{availability,calendar}.service.ts`,
  `apps/api/src/scheduling/infra/appointment-read.repository.ts`,
  `apps/api/src/scheduling/http/public/public-availability.controller.ts`,
  `apps/api/src/scheduling/http/dentist/calendar.controller.ts`,
  `apps/api/src/scheduling/http/dto/availability-query.dto.ts`,
  `apps/api/test/e2e/scheduling/{availability,calendar}.e2e-spec.ts`
- Modificar: `docs/architecture/arquitetura.md` §5 (linha do `/calendar`) e §7.1

**Contratos:**

```ts
// shared-types
export interface AvailabilityResponse { timeZone: string; durationMinutes: number; days: { date: string; starts: string[] }[] }
export interface CalendarResponse {
  timeZone: string;
  days: { date: string; dayOfWeek: number; workingHours: { startAt: string; endAt: string }[];
          holiday: { name: string; overridden: boolean } | null }[];
  blocks: BlockDto[];
  appointments: { id: string; startAt: string; endAt: string; status: string; contactName: string;
                  procedureName: string | null; onHoliday: boolean; outsideWorkingHours: boolean }[];
}

// application/availability.service.ts (sem lock: só leitura)
getPublicAvailability(q: { from: LocalDate; to: LocalDate; serviceId?: string }): Promise<AvailabilityResponse>;
//  professionalId = forPublic(); to < from ou daysBetweenInclusive > AVAILABILITY_MAX_DAYS → VALIDATION_FAILED (400);
//  serviceId inexistente/inativo/de outra profissional → PROCEDURE_INACTIVE (422); duração por resolveDurationMinutes;
//  holidays = holidaysForDates(eachLocalDate(from, to)) — todos os anos da janela;
//  occupied = agendamentos com status em OCCUPYING_STATUSES que intersectam a janela; now = clock.now().
//  Resposta: só datas e ISO dos inícios (nada de ocupação, motivo ou feriado — spec 10.3).

// application/calendar.service.ts
getCalendar(professionalId, q: { from: LocalDate; to: LocalDate }): Promise<CalendarResponse>;
//  mesma validação de janela; workingHours de cada dia = instantAt da linha; holiday do dia com o estado de override;
//  appointments = só ocupantes, por startAt; onHoliday = dia local do startAt é feriado NÃO desbloqueado;
//  outsideWorkingHours = [startAt, endAt) não cabe inteiro numa faixa daquele dia (RN-45).
```

Rotas: `GET /public/availability?from&to&serviceId?` (`@Public()`,
`@Throttle({ default: { limit: 60, ttl: 60_000 } })`); `GET /calendar?from&to`.

**Testes de aceite (testador).** `availability.e2e-spec.ts`, com `FixedClock` em `BASE_NOW`
e `seedProfessional`:

| Tag | Dado / Quando | Então |
|---|---|---|
| CA-1.6 | `GET /public/availability?from=2026-11-09&to=2026-11-09` sem `serviceId` | `durationMinutes: 30`; os inícios de 09/11 são a grade de 30 min |
| CA-1.8 | cada data do critério, `from = to` = a data | `starts: []` |
| CA-1.15 | bloqueio FULL_DAYS 16–20/11 criado por `POST /blocks`; `from=2026-11-16&to=2026-11-20` | 5 dias, todos `starts: []` |
| CA-1.21 | `from=2026-11-01&to=2026-12-02` (32 dias), `to < from`, `from=2026-02-30`, `from=abc`, sem `to` | 400 `VALIDATION_FAILED` em todos |
| CA-1.23 | `POST /holiday-overrides {date:'2026-12-08'}` e depois disponibilidade de 08/12 | igual à de uma terça normal (`08:00`…`10:30`, `13:30`…`16:00` em 30 min) |
| CA-3.25 | resposta de 09/11 com um agendamento `CONFIRMED` e um bloqueio com `reason: 'Curso'` | `Object.keys(body)` = `['timeZone','durationMinutes','days']`; cada dia só `date`/`starts`; o JSON serializado não contém `'Curso'`, o nome do paciente nem o id do agendamento |

`calendar.e2e-spec.ts`:
- `[CA-1.8]` `GET /calendar?from=2026-11-02&to=2026-11-02` → `days[0].holiday` =
  `{ name: 'Finados', overridden: false }`. O mesmo vale para as outras datas do critério,
  com o nome da tabela da Tarefa 7.
- `[CA-1.23]` depois do desbloqueio, `08/12` → `holiday: { name: 'Imaculada Conceição',
  overridden: true }`.
- `[CA-1.26]` 08/12 desbloqueado + agendamento `CONFIRMED` 08/12 09:00–09:30 (factory) →
  `DELETE /holiday-overrides/2026-12-08` → disponibilidade de 08/12 `starts: []`; o
  agendamento continua com o mesmo `status`/`startAt`/`endAt` no banco; o calendário o
  traz com `onHoliday: true`.
- `[CA-1.19]` (complemento da Tarefa 9): procedimento desativado + agendamento que o usa →
  `appointments[0].procedureName` = o nome.
- Sem tag: agendamento 11:30–12:00 numa segunda → `outsideWorkingHours: true`; 09:00–09:30
  → `false`.
- Foco da revisão, item 1 (sem tag): disponibilidade `2026-12-28..2027-01-03` → 01/01/2027
  com `starts: []`; calendário do mesmo período →
  `holiday.name = 'Confraternização Universal'`.
- Foco da revisão, item 4 (sem tag): `serviceId` de procedimento desativado e UUID
  inexistente → 422 `PROCEDURE_INACTIVE`.

**Verificação:** cada `-t "CA-1.x]"` acima, as suítes e2e e int inteiras, `pnpm typecheck`,
`pnpm lint`. Commit: `feat: disponibilidade pública e calendário do painel`.

---

### Tarefa 13: Varredura de rotas sem sessão e checklist de segurança da fatia

Receita: guia §6 (fatia 1); arquitetura §8. Critério: **CA-1.22** (E).

**Arquivos:** criar `apps/api/test/e2e/security/routes-require-session.e2e-spec.ts`.

**Testes de aceite (testador):**

```ts
describe('[Segurança] nega por padrão (spec 10.1)', () => {
  // CA-1.22: Dado qualquer rota da dentista sem cookie de sessão, então 401 (teste e2e que percorre
  // todas as rotas do módulo, exceto as públicas listadas na seção 7).
  const PUBLIC_ROUTES = ['GET /', 'POST /auth/login', 'POST /auth/refresh',
                         'GET /public/procedures', 'GET /public/availability'];
  it('[CA-1.22] o conjunto de rotas @Public() é exatamente a lista fechada', …);
  //   enumera controllers/métodos por DiscoveryService + MetadataScanner + Reflector (PATH_METADATA,
  //   METHOD_METADATA, IS_PUBLIC_KEY); compara o conjunto público com PUBLIC_ROUTES (toEqual, ordenado)
  it('[CA-1.22] toda rota não pública responde 401 sem cookie', …);
  //   para cada rota não pública enumerada: request sem cookie (params :id/:date preenchidos com UUID/data válidos,
  //   corpo JSON {}) → 401; afirmar também que a lista enumerada contém ≥ as 11 rotas autenticadas desta fatia
  //   (nomes explícitos), para o teste não passar vazio.
});
```

**Checklist (revisor, guia §6 fatia 1):** rotas públicas só as 2 novas;
`professionalId` no corpo → 400 (testes das Tarefas 9 e 10); disponibilidade ≤ 31 dias,
só inícios, 60/min; motivo de bloqueio nunca em rota pública; `json-only` ativo;
`configureApp` no `main.ts` e nos testes. `grep -rn "logger\." apps/api/src/scheduling`
sem DTO, entidade inteira ou `reason`.

**Verificação:** `pnpm --filter api test:e2e -- -t "CA-1.22]"`. Prova de que o teste
pega o erro: pôr `@Public()` temporário em `GET /procedures` → o primeiro `it` falha;
remover. Commit: `test: varredura de rotas sem sessão (CA-1.22)`.

---

### Tarefa 14: Fundação do web

Receitas: guia §8 "Web", §3.10, §4.7; arquitetura §3, §3.3, §3.7; `apps/web/AGENTS.md`.

**Arquivos:**
- Modificar: `apps/web/package.json` (`luxon@3.7.2`, `@types/luxon@3.7.6`, Vitest, Testing
  Library, jsdom, `@vitejs/plugin-react`, Playwright — versões exatas pela regra da §3.10,
  conferidas no dia), `apps/web/src/app/layout.tsx` (`lang="pt-BR"`; metadata
  `title: 'Dra. Eloísa Paiva — Agendamento'`, `description: 'Agendamento de consultas
  odontológicas da Dra. Eloísa Paiva, em Belo Horizonte.'`),
  `apps/web/src/app/api/refresh-and-continue/route.ts` (só o comentário: proxy em
  Node.js), `apps/web/src/app/dashboard/page.tsx`, `apps/web/eslint.config.mjs`
  (`no-restricted-imports` de `luxon` fora de `src/lib/clinic-time.ts`; `react/no-danger`)
- Mover: `apps/web/src/app/page.tsx` → `apps/web/src/app/(public)/page.tsx` (nome da
  clínica e "Em breve, agendamento online.") e criar `(public)/layout.tsx` (cabeçalho e
  rodapé simples)
- Criar: `apps/web/vitest.config.mts`, `apps/web/playwright.config.ts`,
  `apps/web/e2e/support/{global-setup,db}.ts`, `apps/web/e2e/fatia-1/smoke.spec.ts`,
  `apps/web/src/lib/{clinic-time,api-server,api-errors}.ts` (+ `.test.ts`),
  `apps/web/src/app/dashboard/layout.tsx`, `apps/web/src/components/dashboard/nav.tsx`

**Contratos (produz):**

```ts
// src/lib/clinic-time.ts — único importador de luxon no web
export function localDateOf(instantIso: string): string;
export function localMinuteOf(instantIso: string): number;
export function formatClinicTime(instantIso: string): string;          // '08:00'
export function formatClinicDate(date: string): string;                // 'segunda-feira, 9 de novembro'
export function weekStartOf(date: string): string;                     // segunda da semana
export function addDays(date: string, n: number): string;
export function todayInClinic(): string;

// src/lib/api-server.ts — import 'server-only'
export class ApiError extends Error { status: number; code?: ErrorCode }
export async function apiServer<T>(path: string): Promise<T>;  // repassa cookies(); 401 → redirect('/login'); outro erro → ApiError

// src/lib/api-errors.ts
export function messageFor(code: string | undefined): string;   // pt-BR para cada ErrorCode da fatia 1; desconhecido → 'Algo deu errado. Tente de novo.'
export async function readApiError(res: Response): Promise<{ code?: ErrorCode; message: string }>;
```

- `dashboard/layout.tsx`: `await getCurrentUser()` e navegação "Agenda", "Procedimentos",
  "Horário", "Bloqueios e feriados". `dashboard/page.tsx`: `redirect('/dashboard/agenda')`.
- Playwright: `webServer` sobe a API (`DATABASE_URL` do teste, `SCHEDULER_ENABLED=false`,
  porta 3001) e o web (porta 3000). O `global-setup` roda `prisma migrate deploy`,
  `truncateAll` e o seed no `agendamento_test` com as credenciais do `.env.test`. Helper
  `loginAsDentist(page)`.

**Testes (testador):**
- `clinic-time.test.ts` (W): `formatClinicTime('2026-11-09T11:00:00.000Z') === '08:00'`;
  `formatClinicDate('2026-11-09') === 'segunda-feira, 9 de novembro'`;
  `weekStartOf('2026-11-12') === '2026-11-09'`;
  `localDateOf('2026-11-10T02:59:00.000Z') === '2026-11-09'`. Também com
  `process.env.TZ='Asia/Tokyo'`: mesmos resultados.
- `api-errors.test.ts` (W): cada `ErrorCode` da fatia tem mensagem própria (≠ da padrão);
  código desconhecido → mensagem padrão.
- `smoke.spec.ts` (P): `/` mostra o nome da clínica e `<html lang="pt-BR">`; `/dashboard`
  sem sessão → `/login`; depois do login → `/dashboard/agenda`. A página da agenda pode
  ainda ser 404 aqui; a Tarefa 17 a cria e este teste passa a exigir o título "Agenda".

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e`,
`pnpm --filter web typecheck`, `pnpm --filter web build`, `pnpm lint`. `git status`: se o
`next dev` recriou o bloco do `apps/web/AGENTS.md`, commitar junto. ADR: Vitest/Playwright
entram na ADR 033 (acrescentar as versões instaladas). Commit:
`feat: fundação do web (pt-BR, clinic-time, apiServer, Vitest, Playwright)`.

---

### Tarefa 15: Telas de procedimentos e horário semanal

Receita: guia §3.8; arquitetura §3.2, §3.6.

**Arquivos:**
- Criar: `apps/web/src/app/dashboard/procedimentos/page.tsx`,
  `apps/web/src/app/dashboard/horario/page.tsx`,
  `apps/web/src/components/procedures/{procedure-form,procedure-list}.tsx` (+ `.test.tsx`),
  `apps/web/e2e/fatia-1/procedimentos.spec.ts`
- shadcn (`pnpm dlx shadcn@4.19.0 add input label select checkbox badge alert dialog`), só os
  usados
- `packages/shared-types/src/schemas.ts`: Zod `procedureFormSchema` (nome 1..100 com
  `trim`, duração ∈ `PROCEDURE_DURATIONS`)

**Comportamento:**
- `/dashboard/procedimentos` (Server): lista de `GET /procedures` com nome, duração e
  "inativo"; formulário de criar (`Client`: nome + select 30/60/90); editar nome/duração;
  botão Desativar/Reativar. Erro da API via `messageFor(code)`; sucesso →
  `router.refresh()`.
- `/dashboard/horario` (Server): `GET /working-hours` agrupado por dia, de segunda a sexta,
  no formato "08:00–11:00 · 13:30–17:00", e sábado/domingo "Sem atendimento". Só leitura
  (RN-45: edição é baixa prioridade, fora da fatia).

**Testes (testador):**
- `procedure-form.test.tsx` (W, `fetch` mockado): submit com nome vazio não chama a API e
  mostra o erro; resposta 409 `PROCEDURE_NAME_TAKEN` mostra `messageFor` desse código.
- `procedimentos.spec.ts` (P): cria "Limpeza" 60 min → aparece na lista; desativa → mostra
  "inativo"; `GET /public/procedures` (via `request`) não a contém. Horário: a página mostra
  "Segunda-feira 08:00–11:00 · 13:30–17:00" e "Sexta-feira 08:00–10:30".

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e -- procedimentos`,
`pnpm --filter web typecheck`, `pnpm lint`. Commit:
`feat: telas de procedimentos e horário semanal`.

---

### Tarefa 16: Tela de bloqueios e feriados

Receita: guia §3.8. Critérios (P): **CA-1.8**, **CA-1.23**.

**Arquivos:**
- Criar: `apps/web/src/app/dashboard/bloqueios/page.tsx`,
  `apps/web/src/components/schedule/{block-form,block-list,holiday-list}.tsx` (+ `.test.tsx`),
  `apps/web/e2e/fatia-1/bloqueios-feriados.spec.ts`
- `shared-types/src/schemas.ts`: `blockFormSchema` (dia inteiro: `fromDate ≤ toDate`;
  período: data e hora de início + data e hora de fim, fim > início, reason ≤ 200)

**Comportamento:**
- `searchParams.ano` (padrão: ano de `todayInClinic()`).
- Bloqueios: `GET /blocks?from=hoje&to=hoje+365`, cada um com período no fuso da clínica e
  motivo. Formulário "Dia(s) inteiro(s)" (de/até) ou "Período" (data, início, data de fim, fim; RN-42). O
  período vira ISO com o offset certo via `clinic-time` do web (função
  `clinicLocalToIso(date, 'HH:mm')`, acrescentada lá). Excluir, com confirmação por
  `Dialog` (nunca `window.confirm`).
- Feriados: `GET /holidays?year` com data por extenso, nome e estado ("feriado — fechado" ou
  "feriado — atendendo"); botões "Atender neste dia" (`POST /holiday-overrides`) e "Voltar a
  fechar" (`DELETE`).

**Testes (testador):**
- `block-form.test.tsx` (W): dia inteiro com `toDate < fromDate` não envia; período envia
  `startAt`/`endAt` ISO de `09/11 09:15–09:45` = `2026-11-09T12:15:00.000Z`/`12:45`.
- `bloqueios-feriados.spec.ts` (P), com datas relativas a hoje:
  - `[CA-1.8]` a lista do ano corrente mostra o próximo 25/12 como "Natal" e o 02/11 como
    "Finados", marcados como feriado;
  - `[CA-1.23]` clicar "Atender neste dia" no próximo 08/12 (usar `?ano=` do ano dele) →
    a linha mostra "feriado — atendendo"; "Voltar a fechar" → "feriado — fechado";
  - sem tag: criar bloqueio de dia inteiro e excluir.

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e -- bloqueios`,
`pnpm --filter web typecheck`, `pnpm lint`. Commit: `feat: tela de bloqueios e feriados`.

---

### Tarefa 17: Agenda semanal (leitura)

Receita: guia §3.8; arquitetura §3.5 (ADR 031). Critério (P): **CA-1.26**; mais o painel
dos CA-1.8 e CA-1.23 na grade.

**Arquivos:**
- Criar: `apps/web/src/app/dashboard/agenda/page.tsx`,
  `apps/web/src/components/calendar/{week-view,week-layout}.tsx`
  (+ `week-layout.test.ts`), `apps/web/e2e/fatia-1/agenda.spec.ts`
- Modificar: `apps/web/e2e/fatia-1/smoke.spec.ts` (exige o título "Agenda")

**Contratos:**

```ts
// components/calendar/week-layout.ts (puro, testado no Vitest)
export interface PositionedItem { id: string; dayIndex: number; topSlot: number; spanSlots: number }  // slots de 15 min
export function layoutWeek(cal: CalendarResponse, opts: { firstMinute: number; lastMinute: number }): {
  bands: PositionedItem[]; blocks: PositionedItem[]; appointments: PositionedItem[] };
//  posição por localMinuteOf (clinic-time do web); bloqueio de vários dias recortado por dia
```

**Comportamento:** `/dashboard/agenda?semana=YYYY-MM-DD` (padrão: semana de hoje; navegação
anterior/próxima). Server lê `GET /calendar?from=seg&to=dom`. A `WeekView` (Client, só
leitura) é uma grade de 07:00 a 19:00 em linhas de 15 min, com:
- faixas de atendimento em fundo claro;
- bloqueios hachurados com o motivo;
- no cabeçalho do dia, o feriado ("Finados — fechado" ou "Imaculada Conceição —
  atendendo");
- agendamentos com nome, horário e procedimento; `PENDING` com borda tracejada; selo "em
  feriado" se `onHoliday` e "fora do horário" se `outsideWorkingHours`;
- legenda "Horários de Brasília".

**Testes (testador):**
- `week-layout.test.ts` (W): agendamento 09:00–10:00 de segunda com `firstMinute = 420` →
  `dayIndex 0`, `topSlot 8`, `spanSlots 4`; bloqueio de sexta 16:00 a sábado 09:00 vira 2
  itens.
- `agenda.spec.ts` (P), com datas relativas e o agendamento criado direto no banco
  (`e2e/support/db.ts`, porque a fatia 1 não tem tela de marcar):
  - `[CA-1.26]` próximo 08/12 desbloqueado pela tela de feriados + agendamento nele →
    "Voltar a fechar" → na agenda da semana do 08/12, o agendamento continua visível com o
    selo "em feriado";
  - `[CA-1.8]` a semana de um feriado mostra o nome no cabeçalho do dia;
  - `[CA-1.23]` com o feriado desbloqueado, o cabeçalho diz "atendendo".

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e`,
`pnpm --filter web typecheck`, `pnpm --filter web build`, `pnpm lint`. Commit:
`feat: agenda semanal do painel (leitura)`.

---

### Tarefa 18: Fechamento da fatia (orquestrador + testador)

Receitas: guia §4.8, §5.2; CLAUDE.md §3.5.

- [ ] **Regressão completa** (guia §4.8), com a saída real de cada comando:
      `shared-types build`, `pnpm lint && git status --short`, `pnpm typecheck`, `pnpm test`,
      `test:int`, `test:e2e`, `web test:e2e`, `pnpm build`.
- [ ] **Rastreabilidade** (guia §4.3): o `comm -23` não lista nenhum `CA-1.x`. Os CA das
      fatias 2–4 aparecem, e o único CA de outra fatia que precisa ter teste é o CA-3.33.
      CA-3.25 também já tem teste.
- [ ] Repetir 20× os testes de concorrência da fatia (`advisory-lock`, CA-1.18 int).
- [ ] **Checklist de segurança** da fatia 1 (guia §6) marcado pelo revisor.
- [ ] **Passeio manual** com seed limpo (`pnpm --filter api exec prisma migrate reset`,
      `pnpm dev`), seguindo "O que a cliente usa no fim" (spec §8, fatia 1): login →
      procedimentos (criar, editar, desativar) → horário → bloqueio de dia inteiro e de
      período → feriados (desbloquear 08/12 e desfazer) → agenda da semana.
- [ ] **Documentos:**
  - arquitetura §5/§7.1 (Tarefa 12);
  - guia: marcadores "(fatia 1)" → "(existe)" na §1.3, e §8 com as dívidas pagas;
  - ADRs usadas com as versões reais (022, 033);
  - `.env*.example` conferidos.
- [ ] **Pendências da cliente** que não bloqueiam o código, mas precisam de resposta para a
      fatia fechar (spec §9.4 e §12): confirmar a lista de feriados municipais de BH no
      decreto da PBH; confirmar o Carnaval (segunda e terça fechadas, quarta aberta).
- [ ] Relatório ao usuário com a evidência; o usuário aprova antes da fatia 2.

Fora desta fatia, de propósito: RN-43 nos bloqueios (fatia 2), edição do horário semanal
(RN-45, baixa prioridade), `COOKIE_DOMAIN` (antes do primeiro deploy, guia §8), throttler
`hourly` (fatia 3) e procedimentos iniciais no seed (lista da cliente em aberto).
