# Guia de desenvolvimento — Agenda e Agendamento

Referência prática para quem implementa as fatias (pessoas ou agentes).

- **Porquê:** [`arquitetura.md`](arquitetura.md).
- **Regras:** a spec `docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md`,
  citada por `RN-xx`, `T1`–`T14`, `CA-x.y`.
- **Decisões:** `docs/decisions.md`.

Marcadores:
- **(existe)** já está no repositório (2026-10-28).
- **(fatia 1)** é criado na fundação da fatia 1 (ver [seção 8](#8-dividas-fatia-1)).

---

<a id="1-setup"></a>
## 1. Setup e comandos

<a id="1-1-pre-requisitos"></a>
### 1.1 Pré-requisitos

| Item | Versão | Observação |
|---|---|---|
| Node | 22 (`.nvmrc`); Next 16 exige ≥ 20.9 | |
| pnpm | 9.12.0 (`packageManager`) | `npm i -g pnpm@9.12.0`, **não** corepack |
| Docker Desktop | recente | No Windows, abrir manualmente antes de `docker compose` |
| Shell | Git Bash ou PowerShell | Exemplos em bash; PowerShell em [1.5](#1-5-banco) |

<a id="1-2-primeira-vez"></a>
### 1.2 Primeira vez (clone novo)

```bash
cp .env.example .env                              # DATABASE_URL e DATABASE_URL_TEST (shell)
cp apps/api/.env.example apps/api/.env            # runtime da API
cp apps/api/.env.test.example apps/api/.env.test  # testes da API
cp apps/web/.env.local.example apps/web/.env.local
docker compose up -d                              # Postgres 16.15 (+ Mailpit a partir da fatia 4)
pnpm install                                      # roda `prisma generate`
pnpm --filter api exec prisma migrate deploy      # banco de dev
pnpm --filter api db:seed                         # dentista (+ Professional e horário, fatia 1)
pnpm dev                                          # api :3001, web :3000
```

Banco de teste: aplicado automaticamente pelo `globalSetup` a partir da fatia 1; antes
disso, à mão ([1.5](#1-5-banco)).

<a id="1-3-comandos"></a>
### 1.3 Comandos do dia a dia

| Objetivo | Comando | Estado |
|---|---|---|
| Subir tudo | `pnpm dev` | existe |
| Só API / só web | `pnpm --filter api dev` · `pnpm --filter web dev` | existe |
| Lint | `pnpm lint` (o do api usa `--fix` e **altera arquivos**; conferir `git status`) | existe |
| Build | `pnpm build` | existe |
| Unit (api) | `pnpm --filter api test` | existe |
| Um critério | `pnpm --filter api test -- -t "CA-1.1]"` (o `]` final impede que `CA-1.1` case com `CA-1.10`; não use `\[`: no Windows o pnpm dobra a barra e o regex quebra) | existe |
| E2E da API | `pnpm --filter api test:e2e` (ganha `--runInBand` na fatia 1) | existe |
| Integração | `pnpm --filter api test:int` | fatia 1 |
| Typecheck | `pnpm typecheck` | fatia 1 |
| Build do shared-types | `pnpm --filter @sistema-agendamento/shared-types build` | fatia 1 |
| Testes do web | `pnpm --filter web test` (Vitest) · `pnpm --filter web test:e2e` (Playwright) | fatia 1 |
| Prisma Studio | `pnpm --filter api exec prisma studio` | existe |
| Migration | `pnpm --filter api exec prisma migrate dev --name <nome_snake>` | existe |
| Seed | `pnpm --filter api db:seed` | existe |
| Caixa de e-mail dev | http://localhost:8025 (Mailpit) | fatia 4 |

<a id="1-4-env"></a>
### 1.4 Variáveis de ambiente

| Arquivo | Lido por | Hoje | Acrescentar (fatia) |
|---|---|---|---|
| `.env` (raiz) | só comandos de shell | `DATABASE_URL`, `DATABASE_URL_TEST` | — |
| `apps/api/.env` | `dotenv/config` no `main.ts`, Prisma CLI, seed | `PORT`, `DATABASE_URL`, `CORS_ORIGIN`, `JWT_SECRET`, `SEED_DENTIST_*` | `TZ=UTC`, `WEB_BASE_URL`, `SCHEDULER_ENABLED` (1); `TURNSTILE_SECRET_KEY` (3); `EMAIL_SENDER`, `MAILPIT_URL`, `MAIL_FROM`, `MAIL_REPLY_TO`, `DENTIST_NOTIFICATION_EMAIL`, `CLINIC_NAME`, `CLINIC_PHONE`, `CLINIC_ADDRESS` (4; `CLINIC_PHONE` já na 3, para a mensagem da RN-18). `COOKIE_DOMAIN` fica **ausente** em dev |
| `apps/api/.env.test` | testes (`dotenv` no topo de cada arquivo hoje; `setupFiles` na fatia 1) | `DATABASE_URL` → `agendamento_test`, `JWT_SECRET` | `CORS_ORIGIN`, `SCHEDULER_ENABLED=false`, `EMAIL_SENDER=fake`, `WEB_BASE_URL`, `CLINIC_PHONE` |
| `apps/web/.env.local` | Next | `NEXT_PUBLIC_API_URL` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (3) |

- Cada var nova vai no `.example` correspondente no mesmo commit.
- Var obrigatória em produção falha no boot se ausente (padrão do `CORS_ORIGIN`).
- Valores de produção (hosts `agenda.`/`api.agenda.`, `COOKIE_DOMAIN`):
  [arquitetura 9](arquitetura.md#9-config).
- Turnstile em dev: usar as chaves de teste publicadas na documentação da Cloudflare,
  copiadas de lá. Nos testes automatizados da API, `FakeCaptchaVerifier` (sem rede).

<a id="1-5-banco"></a>
### 1.5 Banco: dev, teste, reset

| Ação | bash | PowerShell |
|---|---|---|
| Migrar o banco de teste (antes da fatia 1) | `DATABASE_URL="postgresql://agendamento:agendamento_dev_only@localhost:5432/agendamento_test" pnpm --filter api exec prisma migrate deploy` | `$env:DATABASE_URL="postgresql://agendamento:agendamento_dev_only@localhost:5432/agendamento_test"; pnpm --filter api exec prisma migrate deploy; Remove-Item Env:DATABASE_URL` |
| Resetar o dev (apaga, reaplica, roda o seed) | `pnpm --filter api exec prisma migrate reset` | idem |
| Zerar o volume | `docker compose down -v && docker compose up -d` | `docker compose down -v; docker compose up -d` |
| psql | `docker compose exec postgres psql -U agendamento -d agendamento_dev` | idem |

Teste só no `agendamento_test`. O `globalSetup` (fatia 1) aborta se o nome do banco não
terminar em `_test`.

---

<a id="2-onde-ficam"></a>
## 2. Onde as coisas ficam

Layout: [arquitetura 2.2](arquitetura.md#2-2-camadas) (API) e
[3.1](arquitetura.md#3-1-rotas) (web).

<a id="2-1-convencoes"></a>
### 2.1 Convenções de nome

| Coisa | Convenção | Exemplo |
|---|---|---|
| Arquivo TS | kebab-case + papel | `public-booking.service.ts`, `create-block.dto.ts`, `week-view.tsx` |
| Teste unit | ao lado, `*.spec.ts` | `src/scheduling/domain/availability.spec.ts` |
| Teste de integração | `apps/api/test/integration/**/*.int-spec.ts` | `test/integration/scheduling/purge.int-spec.ts` |
| E2E da API | `apps/api/test/e2e/**/*.e2e-spec.ts` (os 3 atuais podem ficar em `test/`) | `test/e2e/public-appointments.e2e-spec.ts` |
| Apoio de teste | `apps/api/test/support/` | `clock.ts`, `db.ts`, `factories.ts`, `app.ts` |
| Testes do web | `*.test.ts(x)` ao lado (Vitest); `apps/web/e2e/` (Playwright) | `clinic-time.test.ts`, `e2e/fatia-3/agendar.spec.ts` |
| Código de erro | `UPPER_SNAKE` | `BOOKING_NOT_ALLOWED` |
| Evento | `appointment.<passado>` | `appointment.contact_updated` |
| Kind de notificação | `snake_case`, nomes da spec 6.8 | `patient_cancelled_confirmation` |
| Migration / constraint à mão | `snake_case` | `scheduling_enum_values`, `service_active_name_ci_key` |
| Rota da API | inglês, plural, ação como subrecurso | `POST /appointments/:id/reject` |
| Rota do web | português | `/dashboard/pedidos`, `/agendar` |
| Teste de critério | `[CA-x.y]` no início do nome; `[RN-xx]` no `describe` | [4.3](#4-3-criterios) |

<a id="2-2-regras-de-dependencia"></a>
### 2.2 Regras de dependência (lint quando possível)

- `*/domain/**` não importa `@nestjs/*` nem `@prisma/client` e nunca chama
  `new Date()`/`Date.now()`.
- Só `clinic-time.ts` (api e web) importa `luxon`.
- `notifications/**` só importa de `scheduling/contracts/**`.
- Proibidos: `$queryRawUnsafe`/`$executeRawUnsafe` e `dangerouslySetInnerHTML`.

---

<a id="3-receitas"></a>
## 3. Receitas

<a id="3-1-endpoint-autenticado"></a>
### 3.1 Endpoint da dentista

1. Regra nova? Siga primeiro a [3.3](#3-3-regra-de-dominio).
2. **DTO** em `scheduling/http/dto/<acao>.dto.ts` (class-validator). Nunca inclua
   `professionalId` nem campos imutáveis (ex.: `phone` na edição de contato), para o
   `forbidNonWhitelisted` recusar. Use `@IsIsoInstant`, `@IsLocalDate`,
   `@NoControlChars` e as constantes do `shared-types`.
3. **Caso de uso** em `scheduling/application/`:
   - assinatura `(professionalId, input)`;
   - `const now = this.clock.now()` uma vez;
   - `$transaction(async (tx) => …, { timeout, maxWait })`;
   - `lockSchedule(tx, …)` se o fluxo estiver na lista da
     [arquitetura 2.8](arquitetura.md#2-8-concorrencia);
   - eventos depois do `await` da transação.
4. **Repositório** em `scheduling/infra/` recebendo `tx`; erros do Prisma viram
   `DomainError` (`isOverlapViolation`, `isUniqueViolation`).
5. **Controller** em `scheduling/http/dentist/`, sem `@Public()`. `professionalId` vem de
   `ProfessionalContextService.forUser(req.user!.sub)`. A resposta passa por presenter.
6. **Contrato:** tipos no `shared-types`; código de erro novo →
   [3.11](#3-11-codigo-de-erro); tabela de rotas na
   [arquitetura 5](arquitetura.md#5-api).
7. **Testes:** unit (domínio), `int-spec` (transação/constraint/lock), `e2e-spec` (status
   e corpo). O 401 já é coberto pelo CA-1.22.

<a id="3-2-endpoint-publico"></a>
### 3.2 Endpoint público (exige revisão)

A lista pública é **fechada** (spec 7). Só siga esta receita com spec/ADR autorizando.

1. Tudo da [3.1](#3-1-endpoint-autenticado), em `scheduling/http/public/` com
   `@Public()`.
2. `@Throttle({ default: {…}, hourly: {…} })` com os números da spec 10.2.
3. Nada de dado de paciente, motivo de bloqueio ou distinção ocupado/bloqueado/feriado na
   resposta. Caminhos sensíveis a enumeração (telefone, token) têm o mesmo formato e a
   mesma sequência de consultas.
4. Acrescente a rota à lista do teste CA-1.22 e à [arquitetura 5](arquitetura.md#5-api).
5. Rode o [checklist de segurança](#6-seguranca).

<a id="3-3-regra-de-dominio"></a>
### 3.3 Regra de domínio

1. Ache o `RN`/`CA` na spec. Regra sem id não está aprovada: pergunte.
2. Teste unitário **antes** (skill `superpowers:test-driven-development`):
   `describe('[RN-xx] …')`, `it('[CA-x.y] …')`, datas com `clinicInstant()`
   ([4.4](#4-4-relogio-fixtures)).
3. Função pura em `*/domain/`, com `now`, `timeZone` e dados por parâmetro.
4. Calendário só via `clinic-time.ts` (nunca `getHours()`/`getDay()`).
5. Ligue no caso de uso. Se a regra é guarda de transição, o mesmo limite vai no `WHERE`
   ([3.4](#3-4-transicao)).

<a id="3-4-transicao"></a>
### 3.4 Transição de estado (T1–T14)

1. Guarda pura em `appointment-rules.ts`, com teste de cada linha da tabela da spec 5 que
   ela cobre.
2. Repositório:
   `updateMany({ where: { id, status: <de>, <guarda de tempo com now> }, data: { status: <para>, <tempo>: now, closedAt: now se encerra } })`
   e checar `count`.
3. `count === 1` → `INSERT` de `AppointmentEvent` na mesma transação. `count === 0` →
   reler e lançar `INVALID_STATE`/`APPROVAL_EXPIRED` com `currentStatus`.
4. Depois do commit: `await this.events.emitAsync(AppointmentEvents.X, payload)` com
   `auditEventId` ([arquitetura 2.4](arquitetura.md#2-4-eventos)).
5. Transições que **devem dar o mesmo resultado** (T5b e T6) chamam a **mesma** função de
   repositório.
6. Testes:
   - unit (guarda);
   - int: transição + `AppointmentEvent` + evento emitido (espiar o `EventEmitter2`);
   - int de **corrida**: duas chamadas em `Promise.allSettled` → um vencedor e um único
     `AppointmentEvent`;
   - e2e: códigos HTTP.
7. Se há e-mail: atualizar `notification-plan.ts` e o teste table-driven do CA-4.3.

<a id="3-5-migration"></a>
### 3.5 Migration

**Caso normal:**
1. Editar `schema.prisma`:
   - todo `DateTime` com `@db.Timestamptz(3)` (exceção: `@db.Date` do `HolidayOverride`);
   - relação opcional com `onDelete` explícito, porque o padrão é `SetNull`.
2. `pnpm --filter api exec prisma migrate dev --create-only --name <nome>`.
3. **Ler o SQL gerado**; apagar qualquer `DROP` de objeto feito à mão
   (`no_overlapping_appointments`, `service_active_name_ci_key`, CHECKs).
4. `pnpm --filter api exec prisma migrate dev`.
5. Banco de teste: `globalSetup` (fatia 1) ou manual ([1.5](#1-5-banco)).
6. Commitar o schema e a pasta da migration juntos. Nunca editar migration já aplicada.

**Valor novo em enum do Postgres:** migration A só com os `ADD VALUE` (valor no **fim** do
enum); migration B com o que o usa (spec 6.2).

**SQL que o Prisma não expressa** (EXCLUDE, CHECK, índice parcial): `--create-only`,
acrescentar no fim com comentário e ADR, e escrever um `int-spec` que prova a constraint
com a forma **real** do erro (ADR 007).

<a id="3-6-job"></a>
### 3.6 Job agendado

1. Caso de uso `run(now: Date): Promise<Resultado>` em `application/`, **baseado em
   estado** (pega tudo que venceu) e idempotente (UPDATE condicional, `dedupeKey` ou
   critério de apagar).
2. Se o job apaga ou cria `Patient`, ou lê bloqueio/feriado para decidir, ele pega o
   `lockSchedule` (o expurgo pega).
3. Classe fina em `<modulo>/jobs/<nome>.job.ts`:
   - `@Cron(expr, { name })` (o horário local só via `timeZone: CLINIC_TIME_ZONE`, como no
     expurgo);
   - flag `running`;
   - `run(this.clock.now())`;
   - log `job.finished` com contagens sem PII;
   - atualiza o último run.
4. `ScheduleModule.forRoot()` só se `SCHEDULER_ENABLED !== 'false'`.
5. Testes `int-spec` chamando `run(now)`:
   - antes do limite, nada muda;
   - no limite, muda;
   - duas vezes seguidas, nada duplica;
   - concorrente (`Promise.all`), uma transição e um evento por linha (CA-3.17);
   - recuperação com `now` muito depois do limite (CA-3.32, CA-4.9).

<a id="3-7-email"></a>
### 3.7 E-mail (kind + template)

1. Kind na união `NotificationKind`, com o nome da spec 6.8.
2. Mapeamento em `notification-plan.ts`: paciente só com `contactEmail`; respeitar
   `notifyPatient`; T5b igual a T6.
3. Template `notifications/domain/templates/<kind>.ts`:
   - `subject` constante;
   - `render(data) → { subject, text, html }`, com HTML só via tag `html`;
   - datas com `formatClinicDateTime`;
   - nunca `notes`; texto da dentista (justificativa) só escapado.
4. Unit:
   - snapshot de `text`/`html`;
   - `<script>` e `\r\n` escapados (CA-4.13);
   - assunto fixo;
   - sem observação.
5. Int com o `fake` do `EmailSender`: a transição gera exatamente esse e-mail e nenhum
   outro (CA-4.3, CA-4.4).
6. Conferir no Mailpit: texto puro, remetente, `Reply-To`.

<a id="3-8-tela-painel"></a>
### 3.8 Tela do painel

1. Ler em `apps/web/node_modules/next/dist/docs/01-app/`:
   `01-getting-started/05-server-and-client-components.md`, `06-fetching-data.md` e
   `03-api-reference/03-file-conventions/page.md`.
2. `src/app/dashboard/<rota>/page.tsx` como Server Component `async` com
   `await apiServer('/…')`; `params`/`searchParams` com `await`
   (`PageProps<'/dashboard/<rota>'>`).
3. Interação em `src/components/<area>/<nome>.tsx` (`'use client'`): `apiFetch` →
   `router.refresh()`; erro com `messageFor(code)`.
4. Data/hora sempre por `src/lib/clinic-time.ts`.
5. Formulário: estado local + `schema.safeParse()`; primitives com
   `pnpm dlx shadcn@4.19.0 add`.
6. Testes: Vitest (helpers e Client Components); Playwright (fluxo e Server Components
   `async`).

<a id="3-9-tela-publica"></a>
### 3.9 Tela pública

1. `src/app/(public)/<rota>/page.tsx`; com fetch na API, `await connection()` antes, senão
   o `next build` congela o dado.
2. `publicFetch` (sem credenciais).
3. Sem script de terceiros (exceto Turnstile em `/agendar`). Nenhum dado pessoal na URL;
   token só no fragmento.
4. Cabeçalhos por rota no `headers()` do `next.config.ts`.
5. `metadata` em pt-BR. Testes: Playwright.

<a id="3-10-dependencia"></a>
### 3.10 Dependência nova

1. `npm view <pkg>@<versão> type exports main peerDependencies time --json`.
2. Escolher a versão mais nova com: publicação há **≥ 14 dias**, peer compatível e, no
   `apps/api`, **build CJS** (`exports.require` ou sem `"type": "module"`).
3. `pnpm --filter <app> add <pkg>@<versão-exata> -E`.
4. Teste descartável de import no `apps/api`.
5. ADR (versão, motivo, armadilha).

Versões já avaliadas (2026-10-28): `luxon@3.7.2`, `@types/luxon@3.7.6`,
`@nestjs/schedule@6.1.3`, `@nestjs/event-emitter@3.1.0`, `libphonenumber-js@1.13.11`. Para
Vitest, Playwright e Testing Library, aplicar a regra no dia: houve releases nas últimas 2
semanas.

<a id="3-11-codigo-de-erro"></a>
### 3.11 Código de erro

1. `common/errors/error-codes.ts` (status) e `ErrorCode` no `shared-types`.
2. Fábrica em `domain-error.ts`; `details` sem valores digitados.
3. Mensagem pt-BR em `apps/web/src/lib/api-errors.ts`.
4. Linha na [arquitetura 2.5](arquitetura.md#2-5-erros).
5. Teste e2e do status e do `code`.

---

<a id="4-testes"></a>
## 4. Testes

<a id="4-1-por-camada"></a>
### 4.1 Estratégia por camada

| Nível | Cobre | Ferramenta | Banco | Onde | Comando |
|---|---|---|---|---|---|
| **U** — unit | Motor, feriados, guardas T1–T14, prazos, `pendingOutcome`, `tokenEffect`, `block-impact`, lembrete, plano de notificação, templates | Jest + ts-jest (existe) | não | `src/**/*.spec.ts` | `pnpm --filter api test` |
| **I** — integração | Casos de uso: transação, lock, constraint, UPDATE condicional, jobs, expurgo, outbox, seed | Jest + Postgres real | `agendamento_test` | `test/integration/` | `pnpm --filter api test:int` |
| **E** — e2e API | HTTP: guard, ValidationPipe, erros, throttle, cabeçalhos, cookie | Jest + supertest (existe) + `configureApp` | `agendamento_test` | `test/e2e/` | `pnpm --filter api test:e2e` |
| **W** — unit web | `clinic-time`, grade, mapeamento de erros, paridade Zod, Client Components | Vitest + Testing Library + jsdom | não | `src/**/*.test.ts(x)` | `pnpm --filter web test` |
| **P** — e2e web | Fluxos de tela, Server Components `async`, cabeçalhos do Next | Playwright | dev/test com seed | `apps/web/e2e/` | `pnpm --filter web test:e2e` |
| **M** — manual | CA-4.14 (SPF/DKIM/DMARC), aparência dos e-mails, portão de go-live | checklist | produção | — | — |

Não mockar Prisma em caso de uso (o `auth.service.spec.ts` mocka porque ali não há regra
de banco).

<a id="4-2-configuracao"></a>
### 4.2 Configuração das suítes (fundação da fatia 1)

Hoje (existe):
- unit: config no `package.json` do api (`rootDir: src`, `.*\.spec\.ts$`);
- e2e: `test/jest-e2e.json` (`.e2e-spec.ts$`);
- cada e2e carrega o `.env.test` à mão;
- a app de teste é criada sem o setup do `main.ts`.

A criar: ver a [seção 8](#8-dividas-fatia-1), itens de infraestrutura de teste. Resumo:

| Arquivo | Conteúdo |
|---|---|
| `src/common/configure-app.ts` | Setup do `main.ts`, usado por `main.ts` e `test/support/app.ts` |
| `test/support/load-test-env.ts` | `config({ path: resolve(__dirname, '../../.env.test') })` em `setupFiles` |
| `test/support/global-setup.ts` | Recusa banco que não termine em `_test`; `prisma migrate deploy` |
| `test/jest-int.json` | Como `jest-e2e.json` com `testRegex: ".int-spec.ts$"`, `setupFiles`, `globalSetup` |
| scripts do api | `test:int` (`--runInBand`), `test:e2e` com `--runInBand`, `typecheck` |
| web | `vitest.config.mts`, `playwright.config.ts` (`webServer`), scripts `test`, `test:e2e`, `typecheck` |

`--runInBand` é obrigatório em int/e2e: o banco é compartilhado e há truncamento entre
arquivos.

<a id="4-3-criterios"></a>
### 4.3 Critérios de aceite → testes

**Formato:** cada `CA-x.y` vira pelo menos um `it` com nome começando em `[CA-x.y]`;
regras ficam no `describe('[RN-xx] …')`. Um critério em várias camadas tem um teste por
camada, com a mesma tag.

```ts
describe('[RN-03] duração inteira precisa caber numa faixa', () => {
  it('[CA-1.1] segunda 09/11, 60 min: 08:00–10:00 e 13:30–16:00; sem 10:30 nem 16:30', () => {
    // Dado
    const input = availabilityInput({ weeklyHours: RN01_HOURS, durationMinutes: 60,
      fromDate: '2026-11-09', toDate: '2026-11-09', now: BASE_NOW });
    // Quando
    const starts = computeAvailableStarts(input).get('2026-11-09');
    // Então
    expect(starts!.map(toClinicHHmm)).toEqual(['08:00','08:30','09:00','09:30','10:00',
      '13:30','14:00','14:30','15:00','15:30','16:00']);
  });
});
```

- **Dado** → arrange (fixtures, relógio, banco). **Quando** → uma ação. **Então** → uma
  asserção por cláusula, inclusive as negativas ("nada é criado" vira contagem no banco).
- Critério com lista de casos (CA-1.8, CA-1.10, CA-3.3, CA-3.10, CA-4.3): `it.each`, tag no
  título de cada caso.
- Critério removido (CA-2.4) não tem teste; o conteúdo dele está em CA-3.26.
- Rastreabilidade (critérios da spec sem teste; ignore os marcados "removido"):

```bash
comm -23 \
  <(grep -oE 'CA-[0-9]+\.[0-9]+' docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md | sort -u) \
  <(grep -rhoE '\[CA-[0-9]+\.[0-9]+\]' apps/api/src apps/api/test apps/web/src apps/web/e2e 2>/dev/null | tr -d '[]' | sort -u)
```

**Camada de cada critério** (U, I, E, W, P, M como na [4.1](#4-1-por-camada)):

| Fatia | U | I | E | W | P | M |
|---|---|---|---|---|---|---|
| 1 | 1.1–1.4, 1.6–1.14, 1.16, 1.17, 1.23, 1.24 | 1.13, 1.15, 1.18, 1.20 | 1.5, 1.6, 1.8, 1.18, 1.19, 1.21–1.23, 1.25, 1.26 | — | 1.8, 1.23, 1.26 | — |
| 2 | 2.5, 2.8, 2.10, 2.17, 2.19, 2.20 | 2.1, 2.9, 2.11, 2.12, 2.17 | 2.1–2.3, 2.5–2.14, 2.16, 2.18–2.21 | 2.5 | 2.15 | — |
| 3 | 3.13–3.16, 3.28, 3.32 | 3.5, 3.13–3.17, 3.29, 3.30, 3.32, 3.34 | 3.1–3.12, 3.18–3.21, 3.23–3.28, 3.31, 3.33, 3.34 | 3.3, 3.22 | 3.1, 3.2, 3.7, 3.18, 3.19, 3.21, 3.22 | — |
| 4 | 4.6–4.8, 4.11, 4.13, 4.15–4.19 | 4.1–4.12, 4.15–4.20 | — | — | 4.1 | 4.14 |

Notas para os critérios difíceis:

- **CA-1.10:** inclui ano bissexto (terça de Carnaval de 2028 em 29/02). Teste também a
  Páscoa isolada (`easterSunday`) para os anos citados.
- **CA-1.13:** além do unit, um `int-spec` confere que `statuses.ts` bate com o predicado
  da constraint: em cada status, inserir dois sobrepostos.
- **CA-1.17:** `process.env.TZ = 'UTC'` → calcula → `process.env.TZ = 'America/Sao_Paulo'`
  → calcula → mesmo resultado (o Node relê `TZ`; restaurar no `afterEach`). Para horário
  de verão, `timeZone: 'America/New_York'` em 2026-11-01 (domingo, dia da troca): use
  `weeklyHours` com faixa no domingo, porque a RN-01 não tem horário nesse dia, e um
  intervalo que cruze a troca (ex.: 2026-10-31 a 2026-11-02).
- **CA-1.25:** desbloqueio repetido é idempotente: a 2ª chamada devolve a mesma linha e
  existe uma só.
- **CA-2.11 / 2.12 / 2.17:** em `int-spec` com relógio falso. No 2.12, crie o terceiro
  agendamento entre a prévia e a confirmação (sequencial basta) e confira que nada foi
  criado nem cancelado. No 2.17, `now` = 14:10.
- **CA-2.16 / 3.6:** mesma chave duas vezes → respostas `toEqual` e uma linha só; mesma
  chave, outro horário → 422.
- **CA-2.20:** guarde T1, troque o e-mail, e `lookup` com T1 → 404 `INVALID_LINK`.
- **CA-3.5:** dois `POST` em `Promise.allSettled` sem `await` individual (padrão do
  `appointment-overlap.e2e-spec.ts`) → um 201 e um 409, e uma linha.
- **CA-3.20:** compare o corpo inteiro das respostas (inexistente, malformado, expurgado).
  Não meça tempo em teste automatizado.
- **CA-3.21:** log capturado num destino pino em memória (sem token, telefone, e-mail,
  observação); `Referrer-Policy` conferido no Playwright.
- **CA-3.24:** cada teste usa um IP próprio (`.set('X-Forwarded-For', '203.0.113.N')`,
  funciona com `trust proxy` 1 via `configureApp`). O storage em memória do
  `@nestjs/throttler` 6.5.0 conta o tempo com `Date.now()`, e `jest.useFakeTimers()` está
  proibido em e2e (4.4): a parte "espaçados por mais de 1 minuto" exige trocar o storage no
  teste (opção `storage` do `ThrottlerModule`) por um que leia o relógio falso, ou o teste
  levaria minutos reais.
- **CA-3.28:** dois testes: `lookup` não muda o banco; `confirm` grava `SYSTEM` +
  `APPROVAL_TIMEOUT`.
- **CA-3.29 / 3.30:** relógio falso com `closedAt` a 7d+1min e 6d. Corrida do 3.30:
  `Promise.allSettled([purge.run(now), publicBooking.create(...mesmo telefone)])` → pedido
  criado, sem erro de FK, paciente presente no fim.
- **CA-3.32:** `pendingOutcome` (unit) e sweeper com `now` depois do início (int).
- **CA-3.33:** e2e com `form-urlencoded`, `multipart` e `text/plain` → 415, e
  `POST /auth/refresh` sem corpo, com o cookie de refresh de um login → 201 (sem cookie
  ele dá 401, que não prova nada sobre o 415).
- **CA-4.8, 4.16–4.18:** a regra lê a `Notification` (RN-63). Crie as notificações de
  confirmação/remarcação com `createdAt` do relógio falso antes/depois do `dueAt`. No 4.18,
  status `FAILED`.
- **CA-4.20:** a suíte int inteira da fatia 4 roda com `EMAIL_SENDER=fake`; isso já é o
  teste.

<a id="4-4-relogio-fixtures"></a>
### 4.4 Relógio falso e fixtures

- **Nunca** usar relógio real em teste com data. As datas da spec (09/11/2026…) viram
  passado em semanas.
- `test/support/clock.ts`:
  - `FixedClock` (`current`, `advance(min)`);
  - `clinicInstant('2026-11-09 08:00')` → `Date` UTC;
  - `BASE_NOW = clinicInstant('2026-11-01 12:00')`.
- App de teste: `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(CLOCK).useValue(clock)`;
  o teste muda `clock.current` entre ações.
- **Não** usar `jest.useFakeTimers()` em int/e2e (Prisma e supertest dependem de timers
  reais).
- Toda coluna de tempo que entra em regra (`createdAt`, `confirmedAt`, `cancelledAt`,
  `closedAt`, `Notification.createdAt`, `nextAttemptAt`) é escrita com o `Clock`. As
  factories aceitam esses campos.
- `test/support/factories.ts`:
  - `seedProfessional()` (User + Professional + RN-01);
  - `makeService({ durationMinutes, active })`;
  - `makeAppointment({ status, startAt, durationMinutes, createdAt, closedAt, source, contactEmail })`;
  - `makeBlock()`, `makeHolidayOverride()`, `makeNotification({ kind, status, createdAt })`.
- `test/support/app.ts`: `createTestApp({ clock, captcha?, emailSender? })` aplica
  `configureApp` e troca `CLOCK`, `CaptchaVerifier` (`'test-pass'` passa) e `EmailSender`
  (`fake` com `sent[]`, `failNext(n)`). `loginAsDentist(app)` devolve cookies.

<a id="4-5-isolamento"></a>
### 4.5 Isolamento do banco de teste

- `beforeEach` (int/e2e):
  `TRUNCATE "AppointmentEvent","Notification","Appointment","ScheduleBlock","HolidayOverride","WorkingHours","Patient","_ProfessionalServices","Service","Professional","RefreshToken","User" RESTART IDENTITY CASCADE`
  (helper `truncateAll`; **nunca** `_prisma_migrations`).
- `afterAll`: `await app.close()` e `await prisma.$disconnect()`.

<a id="4-6-concorrencia"></a>
### 4.6 Concorrência real

- Disparar sem `await` individual e esperar com `Promise.allSettled`.
- Afirmar **contagens** no fim (linhas, eventos, notificações), não só status.
- Pool de teste com `connection_limit=5`: até ~4 operações concorrentes; acima disso, o
  lock consultivo pode travar o teste.
- Na primeira vez, repetir 20×:
  `for i in $(seq 20); do pnpm --filter api test:int -- -t "CA-3.5]" || break; done`.

<a id="4-7-frontend"></a>
### 4.7 Testes do frontend

- **Vitest:** funções de `src/lib/` (fuso, grade, prazo "cancela em 5h"), paridade dos
  schemas Zod com a tabela de exemplos, Client Components com `fetch` mockado.
- **Playwright:**
  - uma pasta por fatia;
  - datas **relativas** (ex.: "próxima segunda útil a ≥ 3 dias", por `clinic-time.ts`);
  - as regras de horário exato ficam nos testes da API com relógio falso;
  - `webServer` sobe API e web com o banco de teste, `EMAIL_SENDER=fake` e a chave de
    teste do Turnstile que sempre passa.

<a id="4-8-regressao"></a>
### 4.8 Suíte de regressão

Antes de fechar **qualquer** fatia, tudo, inclusive fatias anteriores:

```bash
pnpm --filter @sistema-agendamento/shared-types build
pnpm lint && git status --short          # o lint do api aplica --fix
pnpm typecheck
pnpm test                                # unit api + vitest web
pnpm --filter api test:int
pnpm --filter api test:e2e
pnpm --filter web test:e2e
pnpm build
```

Permanentes na regressão:

- CA-1.22 (rotas sem sessão);
- CA-1.13 (constraint × status);
- CA-1.17 (fuso);
- CA-3.5 e CA-3.17 (concorrência);
- CA-3.25 (disponibilidade sem vazamento);
- CA-3.33 (CSRF);
- CA-3.29 (expurgo);
- `appointment-overlap.e2e-spec.ts`;
- `auth.e2e-spec.ts`.

<a id="4-9-ci"></a>
### 4.9 Pipeline de CI

`.github/workflows/ci.yml` (ADR 036) roda a regressão da [4.8](#4-8-regressao) em PR e no
`main`: `static-and-unit` → (`api-integration` ‖ `web-e2e`). Ela **não substitui** o
aceite: o testador ainda roda e cola a saída; a pipeline é a segunda execução, numa máquina
limpa. Para reproduzir um job localmente, use os comandos do próprio arquivo. A diferença é
só o lint, que no CI não leva `--fix`.

---

<a id="5-dod"></a>
## 5. Definition of Done

<a id="5-1-tarefa"></a>
### 5.1 Por tarefa

- [ ] Cada `RN`/`CA` tocado tem teste com a tag no nome, escrito antes do código.
- [ ] Regra nova em `domain/`, pura; nenhum `Date.now()` fora do `SystemClock`.
- [ ] Comandos da [4.8](#4-8-regressao) que se aplicam passam (no mínimo: lint, typecheck,
      `test` e a suíte da camada tocada).
- [ ] Migration: SQL revisado, aplicado no teste, `int-spec` da constraint se houver SQL à
      mão.
- [ ] Dependência nova: versão exata, ≥ 14 dias, CJS no api, ADR.
- [ ] Decisão arquitetural nova registrada em `docs/decisions.md` antes da próxima tarefa.
- [ ] `.env*.example` atualizados.
- [ ] Nenhum dado pessoal em log (`grep "logger\." ` no diff; nada de DTO/entidade
      inteiros).
- [ ] Contratos (`shared-types`, tabela de erros, rotas, eventos) atualizados.
- [ ] Revisão de código (skill `superpowers:requesting-code-review`).

<a id="5-2-fatia"></a>
### 5.2 Por fatia

- [ ] Todos os `CA` da fatia com teste verde; a rastreabilidade ([4.3](#4-3-criterios)) não
      lista nenhum.
- [ ] Regressão completa ([4.8](#4-8-regressao)) verde.
- [ ] [Checklist de segurança](#6-seguranca) da fatia marcado.
- [ ] Passeio manual com seed limpo (`prisma migrate reset`), seguindo "O que a cliente usa
      no fim".
- [ ] `docs/architecture/*` atualizados se a implementação divergiu.
- [ ] ADRs da fatia + Índice rápido do `decisions.md`.
- [ ] Fatia 1: [dívidas da seção 8](#8-dividas-fatia-1) pagas.
- [ ] Fatia 3: portão de go-live **não** liberado. Fatia 4: checklist do portão (spec 8).

---

<a id="6-seguranca"></a>
## 6. Checklist de segurança por fatia

**Fatia 1**
- [ ] Rotas novas sem `@Public()`, exceto `GET /public/procedures` e
      `GET /public/availability`.
- [ ] O CA-1.22 enumera as rotas registradas (`DiscoveryService`) e falha se aparecer
      rota pública fora da lista.
- [ ] `professionalId` nunca aceito do cliente (campo no corpo → 400).
- [ ] Disponibilidade: ≤ 31 dias, só inícios (CA-3.25 já pode ser escrito), 60/min.
- [ ] Motivo de bloqueio nunca em rota pública; desbloqueio não expõe nada além dos
      horários.
- [ ] `json-only.middleware` ativo (CA-3.33 já pode ser escrito aqui).
- [ ] `configureApp` no `main.ts` e nos testes.

**Fatia 2**
- [ ] 409 com nome de paciente só em rota autenticada.
- [ ] `notes` ≤ 500, sem caracteres de controle; nada de `dangerouslySetInnerHTML`.
- [ ] Token: 256 bits; gerado/rotacionado/anulado pela RN-38 (CA-2.19, CA-2.20); `phone`
      não editável (CA-2.21).
- [ ] `AppointmentEvent` sem PII (`contact_updated` sem valores).
- [ ] Apagar bloqueio ou desbloqueio gera log estruturado sem o motivo.
- [ ] Marcação direta com `idempotencyKey` obrigatória.

**Fatia 3**
- [ ] Ordem honeypot → chave → captcha → transação (RN-17).
- [ ] Captcha verificado no servidor; segredo fail-closed em produção.
- [ ] Throttle 2/min + 5/h na criação; 10/min em lookup/confirm.
- [ ] RN-16/18: sucesso igual para telefone novo/existente; limite com 422
      `BOOKING_NOT_ALLOWED` genérico (sem contagem, datas ou telefone); `Patient` nunca
      atualizado pelo fluxo público.
- [ ] `SLOT_UNAVAILABLE` único; `INVALID_LINK` único (inclusive expurgado).
- [ ] Token só no corpo do POST e no fragmento da URL; `Referrer-Policy: no-referrer`;
      página de cancelamento sem telefone/e-mail/observação; `lookup` sem efeito
      colateral.
- [ ] Só o Turnstile como script de terceiros, e só em `/agendar`.
- [ ] Aviso "não informe dados de saúde"; link para `/privacidade` (texto da controladora
      com CNPJ, retenção de 7 dias).
- [ ] Expurgo ativo e testado (CA-3.29, CA-3.30); logs do job sem PII.
- [ ] Justificativa de recusa ≤ 500 e escapada na tela.

**Fatia 4**
- [ ] Assunto fixo; HTML escapado (nome, justificativa); texto puro; nada de dado do
      usuário em cabeçalho (CA-4.13, CA-4.15, CA-4.19).
- [ ] E-mail ao paciente sem `notes`.
- [ ] `lastError` e logs de envio sem endereço nem corpo.
- [ ] `EMAIL_SENDER=provider` obrigatório em produção; chave só em env.
- [ ] Link da dentista sem token; login com `?next=` validado como em
      `getSafeRedirectPath`.
- [ ] Portão de go-live (spec 8):
  - [ ] `COOKIE_DOMAIN` no set **e** no clear, testado nos subdomínios reais;
  - [ ] `CORS_ORIGIN` com uma origem;
  - [ ] SPF/DKIM/DMARC de `envio.` (CA-4.14);
  - [ ] captcha de produção;
  - [ ] aviso de privacidade publicado;
  - [ ] `trust proxy` conferido;
  - [ ] processo que não dorme.

---

<a id="7-armadilhas"></a>
## 7. Armadilhas comuns

<a id="7-1-fuso"></a>
### 7.1 Fuso horário

| Erro | Certo |
|---|---|
| `new Date('2026-11-09')` como "segunda" | É meia-noite **UTC** (21:00 de domingo em SP). Use `instantAt('2026-11-09', 0)` |
| `getHours()`, `getDay()`, `setHours()` | Usam o fuso do processo. Use `localMinuteOf`, `dayOfWeekOf` |
| Offset fixo `-03:00` ou `- 3 * 3600_000` | Proibido (spec 9.1) |
| Converter `WorkingHours` com um offset calculado uma vez | Converter **por data** (`instantAt(date, minute)`) |
| `toLocaleString()` sem `timeZone` no front | Sempre o helper ou `timeZone: CLINIC_TIME_ZONE` |
| `now()`/`CURRENT_DATE` do Postgres em regra | `now` da aplicação como parâmetro |
| Bloqueio de dia inteiro até 23:59:59 | Semiaberto até 00:00 do dia seguinte (CA-1.15) |
| `HolidayOverride.date` (`@db.Date`) convertido com o fuso da clínica | `@db.Date` é data pura e o Prisma devolve meia-noite **UTC**: use `localDateToDbDate`/`dbDateToLocalDate` |
| Feriado móvel calculado à mão | `easterSunday()` + deslocamentos (spec 9.4); testar ano bissexto |

<a id="7-2-next"></a>
### 7.2 Next.js 16

- `proxy.ts` (antigo `middleware.ts`) roda em **Node.js** por padrão.
- `params`, `searchParams`, `cookies()` e `headers()` são só assíncronos; use
  `PageProps<'/rota'>`.
- Página sem API de request-time é pré-renderizada no build, **com o fetch rodando no
  build**. Em página pública que lê a API, `await connection()`.
- `revalidateTag` exige dois argumentos (não usamos cache de dados).
- Server Actions são endpoints POST públicos; não usamos.
- `next lint` não existe (o script já é `eslint`).
- `next dev` recria o bloco do `apps/web/AGENTS.md`; commite junto se aparecer.
- Turbopack padrão; crash no Windows já aconteceu (ADR 016). Se for recorrente,
  investigue; `--webpack` só como contorno documentado.

<a id="7-3-prisma"></a>
### 7.3 Prisma 6.19.3 e Postgres

- **Enum:** `ADD VALUE` e o uso dele em migrations separadas.
- **Exclusion constraint:** `PrismaClientUnknownRequestError` com o nome na `message`, sem
  `.code` (ADR 007).
- **Índice parcial/de expressão:** confirmar no `int-spec` a forma real da violação (P2002?)
  antes de mapear.
- **Relação opcional:** `onDelete` padrão `SetNull`; `serviceId` usa `Restrict` explícito.
- **Cascade do expurgo:** `AppointmentEvent` e `Notification` com `onDelete: Cascade`;
  `Patient` com `RESTRICT`, apagado à parte só quando órfão.
- **`updateMany` + `count`** para transição condicional (`update` lança P2025 e mistura
  "não existe" com "mudou").
- **Transação interativa:** timeout padrão 5 s; nada de rede dentro; repasse o `tx` até o
  repositório (`this.prisma` dentro de `$transaction` escapa da transação sem avisar).
- Erro de constraint aborta a transação; o diagnóstico (lista de conflitos) vai fora.
- `@default(now())` é do banco; para regra, informe com o `Clock`.
- SQL cru só com template tag.
- Depois de mudar o schema sem `migrate dev`: `pnpm --filter api exec prisma generate`.

<a id="7-4-auth-cookie"></a>
### 7.4 Cookie e topologia

- `clearCookie` sem o mesmo `domain` do `cookie` **não apaga** a sessão: `COOKIE_DOMAIN`
  vale no set e no clear (spec 9.9).
- Em dev, `COOKIE_DOMAIN` ausente (host-only); `localhost:3000` e `:3001` compartilham
  cookie porque cookie não separa porta.
- `sameSite: 'lax'` trata o site institucional como mesmo site: a regra de `Content-Type`
  (CA-3.33) é a defesa real.

<a id="7-5-testes-instaveis"></a>
### 7.5 Testes instáveis com tempo

- Relógio real + data fixa da spec = quebra quando a data passar.
- `toBeGreaterThan(Date.now())` é instável; compare com o relógio falso.
- Consulta sem `orderBy` falha às vezes; ordene sempre.
- Jest paralelo com banco compartilhado gera falhas fantasmas; use `--runInBand`.
- Throttle compartilhado entre testes gera 429 aleatório; use um IP por teste.
- Teste que muda `process.env.TZ` precisa restaurar o valor.
- `Notification.createdAt` pelo default do banco quebra os testes da RN-63; grave com o
  `Clock`.

<a id="7-6-dependencias"></a>
### 7.6 Dependências e ambiente

- ESM-only no `apps/api` → `SyntaxError: Cannot use import statement outside a module`
  (ADR 017). Confira `type`/`exports`.
- `^` permite um update cruzar para ESM; pin exato (`-E`).
- `shared-types` sem `dist/` → o api falha ao importar; rode o build.
- Docker Desktop não inicia sozinho (erro de pipe no `docker ps`).
- PowerShell: `$env:VAR="x"; comando`, não `VAR=x comando`.
- O build do api gera `dist/src/main.js` (o `rootDir` inclui `prisma/`), por isso o
  `start:prod` é `node dist/src/main`.
- `jsdom` 30 exige Node ≥ 22.22 (puxa `undici` 8); no Node 22.14 use o 29.1.1 (ADR 033).

---

<a id="8-dividas-fatia-1"></a>
## 8. Dívidas a pagar na fatia 1

Itens encontrados no código atual. Nenhum foi alterado ainda; todos entram na fundação da
fatia 1, antes das features.

**Infraestrutura de teste**
- [ ] Extrair `apps/api/src/common/configure-app.ts` do `main.ts` (helmet, cookie-parser,
      CORS, `ValidationPipe`, `trust proxy`) e usá-lo no `main.ts` e nos testes. Hoje os
      e2e criam a app sem nada disso; o `auth.e2e-spec.ts` acrescenta só o
      `cookieParser`.
- [ ] `apps/api/test/app.e2e-spec.ts` não carrega o `.env.test`, mas o `AppModule` exige
      `JWT_SECRET` no import e `DATABASE_URL` no boot; hoje depende do ambiente do shell
      (não verificado: Docker parado). Resolver com `setupFiles`
      (`test/support/load-test-env.ts`) e tirar o `dotenv` do topo dos arquivos.
- [ ] `test:e2e` com `--runInBand`; criar `test:int`, `test/jest-int.json` e
      `global-setup.ts` (migra o `agendamento_test` e recusa outro banco).
- [x] Runner de testes no web: Vitest (+ Testing Library, jsdom) e Playwright, versões
      exatas pela regra da [3.10](#3-10-dependencia); scripts `test` e `test:e2e`.

**Build e scripts**
- [ ] `turbo.json`: `dev` com `"dependsOn": ["^build"]` (hoje só `build` e `test` têm).
- [ ] Script `typecheck` em cada pacote (`api: tsc --noEmit -p tsconfig.json`;
      `web: next typegen && tsc --noEmit`; `shared-types: tsc --noEmit`), tarefa
      `typecheck` no turbo e `"typecheck": "turbo run typecheck"` na raiz.
- [ ] `packages/shared-types` com build real ([arquitetura 3.7](arquitetura.md#3-7-shared-types)).

**Web**
- [x] `apps/web/src/app/layout.tsx`: `lang="en"` → `lang="pt-BR"`; `metadata` com título e
      descrição da clínica (hoje "Create Next App").
- [x] Comentário em `apps/web/src/app/api/refresh-and-continue/route.ts` chama o
      `proxy.ts` de "Edge-style middleware"; no Next 16 o proxy roda em Node.js por
      padrão. Corrigir o texto (o código está certo).
- [x] `apps/web/src/app/page.tsx` ainda é o template do `create-next-app`; vira a entrada
      do agendamento dentro de `(public)/`.

**Antes do primeiro deploy (não bloqueia a fatia 1, mas está no caminho)**
- [ ] `COOKIE_DOMAIN` no `cookie.util.ts` (set **e** clear) + teste e2e do atributo
      (spec 9.9; atualiza a ADR 018).
- [ ] Segundo throttler nomeado (`hourly`) no `ThrottlerModule` (spec 10.2) — fatia 3.
- [ ] `?next=` no login com a validação de `getSafeRedirectPath` extraída para
      `src/lib/safe-redirect.ts` — fatia 4 (CA-4.1).
