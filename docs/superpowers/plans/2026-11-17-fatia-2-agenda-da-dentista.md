# Fatia 2 — Agenda da dentista — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`, com os
> papéis do `CLAUDE.md` §3 (implementador ≠ testador; revisor no fim de cada tarefa). Os passos
> usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** a dentista larga a agenda de papel. No painel ela vê a semana completa
(agendamentos, bloqueios, feriados, desbloqueios, faixas), marca pacientes que ligaram ou
vieram (inclusive encaixes, com aviso), move, estica, cancela, corrige contato/observação,
marca concluído/falta; o sistema não deixa sobrepor e mostra o conflito; bloqueios perguntam
o que fazer com quem já está marcado (RN-43). Toda transição grava um `AppointmentEvent` na
mesma transação. Nenhuma rota pública nova.

**Arquitetura:** primeiro a fundação da fatia: `@nestjs/event-emitter` (ADR 023) e
`libphonenumber-js` (ADR 035) com versão exata, os contratos de eventos e os códigos de erro
novos (receita 3.11). Depois o domínio puro (`phone`, `contact-edit`, `appointment-rules`,
`manual-slot-warnings`, `block-impact`), testado com relógio falso. Em seguida o repositório de
agendamento (transição condicional + `AppointmentEvent`) e os casos de uso T2, T9, T13, T11,
T12 e RN-43, cada um com seu controller no `SchedulingModule`. Por último, o web: diálogos de
marcação, detalhe/ações e a prévia de bloqueio sobre a `WeekView` da fatia 1.

**Stack:** NestJS 11 + Prisma 6.19.3 + Postgres 16; Luxon 3.7.2; Next.js 16.3.3 + React 19;
Jest 30 (api), Vitest + Testing Library + Playwright (web). Novas: `@nestjs/event-emitter` e
`libphonenumber-js` (versões exatas definidas na Tarefa 1).

**Spec:** `docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md` (RN-11, RN-15,
RN-17, RN-30–38, RN-42–46, §5 T2/T7/T9/T11/T12/T13, §6.7, §8 fatia 2, §9.2, §10.6). Leia também
`docs/architecture/arquitetura.md` (§2.3, §2.4, §2.5, §2.7, §2.8, §3.5, §5, §7.2) e
`docs/architecture/guia-de-desenvolvimento.md` (§3.1, §3.3, §3.4, §3.8, §3.10, §3.11, §4, §5,
§6, §7). Toda tarefa cita a receita do guia que se aplica.

---

## Antes de começar (orquestrador)

- [x] (aceitas em 2026-11-17) O usuário aceitou (ou rejeitou) as ADRs 023 (`@nestjs/event-emitter`) e 035
      (`libphonenumber-js`), hoje "Proposta". Rejeitada → replanejar Tarefas 1, 2 e 4 antes
      de despachar.
- [x] O usuário respondeu às perguntas do plano em 2026-11-17 (ver "Decisões do usuário" no
      fim deste plano).
- [ ] O usuário abriu o Docker Desktop: `docker ps` responde e `docker compose up -d` sobe o
      Postgres.
- [ ] Branch `fatia-2-agenda-da-dentista` (já existe; nunca commitar no `main`).
- [ ] O usuário disse se autoriza um commit por tarefa aceita nesta branch (CLAUDE.md §5).
      Sem autorização, o passo "Commit" de cada tarefa vira "deixar staged e listar no
      relatório".

**Ciclo de cada tarefa** (CLAUDE.md §3.3, limite de 3 rodadas de correção):

1. **Implementador:** escreve o **esqueleto** da seção *Contratos*. Métodos de comportamento
   só lançam `new NotImplementedException()` (via HTTP isso vira **501**). `pnpm typecheck`
   passa (ele também rebuilda o `shared-types`: os testes unitários leem o `dist`).
2. **Testador** (skill `testes-agendamento`): escreve os testes da seção *Testes de aceite*,
   roda e confirma que estão **vermelhos pelo motivo certo** (asserção, 501 ou
   `NotImplementedException`, nunca `Cannot find module`).
3. **Implementador:** faz os testes passarem (TDD, com testes unitários próprios de apoio).
   Nunca edita um teste `[CA-x.y]`.
4. **Testador:** roda a *Verificação* e dá o veredito no formato da skill.
5. **Revisor:** `superpowers:requesting-code-review` + checklist do guia §6 (modelo `fable`
   nas Tarefas 4, 5, 7 e 8, que mexem em concorrência).

**Banco compartilhado:** `agendamento_test` é um só. **Nunca** dois agentes rodando int/e2e
(api) ou Playwright (web) ao mesmo tempo. O orquestrador serializa: enquanto um testador roda
int/e2e, o implementador da outra tarefa só roda unit/typecheck/lint.

Tarefas de infraestrutura sem `CA` (1, 3) seguem o mesmo ciclo. O "teste de aceite" delas é a
lista de comandos e asserções da própria tarefa.

## Restrições globais

- `*/domain/**` é puro: sem `@nestjs/*`, sem `@prisma/client`, sem `new Date()`/`Date.now()`.
  `now` entra por parâmetro, vindo do `Clock`. `libphonenumber-js` só em
  `domain/phone.ts` (ADR 035).
- Só os dois `clinic-time.ts` importam `luxon`. Proibidos `getHours()`/`getDay()`, offset fixo
  e `new Date('YYYY-MM-DD')` (guia §7.1).
- Intervalos semiabertos `[início, fim)` (RN-03).
- Transição de estado = `updateMany` condicional (`id`, `professionalId`, status de origem e,
  quando houver, guarda de tempo com `now` da aplicação no `WHERE`) + checagem de `count` +
  `AppointmentEvent` na **mesma** transação; `count = 0` → reler e responder 409
  `INVALID_STATE` com o estado atual (ou 422 da guarda de tempo). Eventos de domínio por
  `emitAsync` **depois** do commit, payload sem dado pessoal, com `auditEventId` (guia §3.4,
  arquitetura §2.4).
- Dentro de `$transaction`, o `tx` vai até o repositório (nunca `this.prisma`).
- `lockSchedule` só em T2 e na criação de bloqueio com RN-43. Remarcar, cancelar, contato e
  concluir/faltar **não** pegam lock: dependem da exclusion constraint e do `updateMany`
  condicional (arquitetura §2.8).
- Violação da exclusion constraint aborta a transação: os conflitos para o 409
  `APPOINTMENT_OVERLAP` são lidos **fora** dela, depois do rollback.
- Proibidos: `$queryRawUnsafe`, `$executeRawUnsafe`, `dangerouslySetInnerHTML`, Server
  Actions.
- `professionalId` nunca vem do cliente: sempre de `ProfessionalContextService`.
- **Nenhuma rota pública nova nesta fatia.** Toda rota nova entra na lista
  `KNOWN_AUTHENTICATED_ROUTES` de `apps/api/test/e2e/security/routes-require-session.e2e-spec.ts`
  (CA-1.22) na própria tarefa que a cria.
- Nenhum dado pessoal (nome, telefone, e-mail, observação, motivo de bloqueio, token) em log,
  `AppointmentEvent`, payload de evento, URL ou mensagem/`details` de erro — exceção única e
  deliberada: o corpo do 409 `APPOINTMENT_OVERLAP` traz horário e nome do conflitante para a
  própria dentista autenticada (CA-2.3; ver "Divergências").
- Dependência nova: versão **exata**, publicada há ≥ 14 dias, CJS no `apps/api` (guia §3.10).
- Código de erro novo: receita 3.11 inteira (api `error-codes.ts`, `ErrorCode` do
  `shared-types`, mensagem pt-BR em `apps/web/src/lib/api-errors.ts`, linha na arquitetura
  §2.5, e2e de status + `code`).
- Testes: `it('[CA-x.y] …')` dentro de `describe('[RN-xx] …')`; instantes por
  `clinicInstant('YYYY-MM-DD HH:mm')`; relógio falso sempre (`FixedClock`); int/e2e só no
  `agendamento_test`, com `--runInBand`; sem `jest.useFakeTimers()` em int/e2e.
- O lint do `apps/api` roda com `--fix`: depois dele, `git status --short`.
- Next.js 16: ler `apps/web/AGENTS.md` e os docs em `apps/web/node_modules/next/dist/docs/`
  antes de código no `apps/web`. Playwright prova visibilidade só com `boundingBox()` não
  nulo e dentro da coluna esperada; `pnpm --filter web test:e2e` ignora filtro (roda tudo);
  o login tem throttle 5/min (reusar `storageState`).

## Foco da revisão

Entradas que a spec implica, nenhum `CA` cobre e devem ter teste (sem tag `[CA]`, com
`describe('[RN-xx] …')`) na tarefa dona:

1. **Duração manual fora da regra** (RN-30: passos de 15 min; arquitetura §2.5: teto 480):
   `durationMinutes` = `0`, `10`, `25`, `495`, `-15`, `30.5` → 422 `INVALID_DURATION` na
   marcação, na prévia e na remarcação; `480` e `15` aceitos. Nunca 500 do CHECK
   `startAt < endAt`. Dono: Tarefa 2 (unit) + Tarefas 4 e 5 (e2e).
2. **Mesmo número, formatações diferentes / número inválido** (RN-11, RN-15):
   `(11) 98888-7777`, `11988887777`, `+55 11 98888-7777`, `+5511988887777` e
   `11 98888 7777` → todos o mesmo `Patient` (`+5511988887777`); fixo `(31) 3222-1234` →
   `+553132221234`; `1234`, `+1 202 555 0100`, `''`, `(11) 9888` → 400 `VALIDATION_FAILED`
   com `fields: ['phone']` e nenhum `Patient` criado. Dono: Tarefa 2 (unit) + Tarefa 4
   (e2e).
3. **Caracteres de controle em nome/observação/e-mail** (RN-11, spec §10.5): `name` com
   `\u0007` ou `\r\n`, `notes` com `\u0000`, `email` com `\r\n` → 400 `VALIDATION_FAILED`
   (só nomes de campo em `details`) na marcação e na edição de contato. `notes` com quebra
   de linha simples `\n`? → Decisão 3. Dono: Tarefas 4 e 6.
4. **Remarcar para o mesmo início e duração** (sem RN): Decisão 1 —
   200 com o agendamento inalterado, **sem** `AppointmentEvent` e sem evento emitido. E a
   prévia de remarcação com `excludeAppointmentId` **não** lista o próprio agendamento como
   conflito, nem quando o novo intervalo o sobrepõe parcialmente (09:00–09:30 → 09:15–09:45).
   Dono: Tarefa 5.
5. **Bloqueio que cruza a meia-noite com encaixe em andamento** (RN-43): "agora" = segunda
   09/11 23:40; `CONFIRMED` 23:30–00:30 (em andamento) e outro terça 10/11 00:30–01:00;
   bloqueio `PERIOD` segunda 23:00 → terça 02:00. Prévia lista só o de 00:30; confirmação
   mantém o de 23:30 `CONFIRMED`. Dono: Tarefa 2 (unit) + Tarefa 8 (int).
6. **Procedimento desativado na remarcação** (RN-40): remarcar mantendo o `serviceId` de um
   procedimento que foi desativado depois da marcação → aceito (o agendamento existente
   continua com o nome); trocar para **outro** `serviceId` desativado ou inexistente → 422
   `PROCEDURE_INACTIVE`. Dono: Tarefa 5.
7. **`keepIds` com duplicata ou `affectedIds` em outra ordem** (RN-43): a comparação é de
   conjunto (ordem e repetição não importam); `affectedIds = []` com prévia vazia cria o
   bloqueio direto. Dono: Tarefa 2 (unit) + Tarefa 8 (e2e).

---

## Mapa de arquivos

```
packages/shared-types/src/
  error-codes.ts                                                   (T1)
  appointments.ts (novo) · index.ts · schemas.ts                   (T1, T4–T8, T10)
apps/api/
  package.json (@nestjs/event-emitter, libphonenumber-js exatos)   (T1)
  src/app.module.ts (EventEmitterModule.forRoot)                   (T1)
  src/common/errors/error-codes.ts                                 (T1)
  src/scheduling/contracts/appointment-events.ts                   (T1)
  src/scheduling/domain/{phone,contact-edit,cancellation-token,appointment-rules,
                         manual-slot-warnings,block-impact}.ts (+ .spec)   (T2)
  src/scheduling/infra/{appointment,patient}.repository.ts         (T3)
  src/scheduling/infra/appointment-read.repository.ts              (T4, T7, T8)
  src/scheduling/infra/schedule.repository.ts                      (T8)
  src/scheduling/application/{appointment-preview,patient-lookup,direct-booking}.service.ts  (T4)
  src/scheduling/application/reschedule-appointment.service.ts     (T5)
  src/scheduling/application/edit-appointment-contact.service.ts   (T6)
  src/scheduling/application/{cancel-appointment,mark-appointment-outcome,appointment-detail}.service.ts (T7)
  src/scheduling/application/schedule-config.service.ts            (T8)
  src/scheduling/http/dentist/{appointments,patients}.controller.ts   (T4–T7)
  src/scheduling/http/dentist/blocks.controller.ts                 (T8)
  src/scheduling/http/dto/{create-appointment,appointment-preview,reschedule-appointment,
                           edit-contact,cancel-appointment,patient-lookup,block-preview,
                           create-block}.dto.ts · is-br-phone.validator.ts  (T4–T8)
  src/scheduling/http/presenters/appointment.presenter.ts          (T4–T7)
  src/scheduling/scheduling.module.ts                              (T3–T8)
  test/support/{factories,events}.ts                               (T3)
  test/integration/scheduling/*.int-spec.ts · test/e2e/scheduling/*.e2e-spec.ts  (T3–T9)
  test/e2e/security/routes-require-session.e2e-spec.ts             (T4–T9)
apps/web/
  src/lib/api-errors.ts (+ .test)                                  (T1)
  src/lib/clinic-time.ts (só se faltar helper; único importador de luxon)  (T10)
  src/components/calendar/{week-view,week-layout}.tsx|ts           (T9, T10)
  src/components/appointments/{appointment-form,appointment-dialog,patient-lookup-field,
     slot-warnings,conflict-list,appointment-detail,cancel-dialog,contact-form}.tsx (+ .test)  (T10, T11)
  src/components/schedule/{block-form,block-preview-dialog}.tsx (+ .test)  (T12)
  src/app/dashboard/agenda/page.tsx                                (T9–T11)
  e2e/fatia-2/{agenda,marcacao,acoes,bloqueio-rn43}.spec.ts        (T9–T12)
docs/
  decisions.md (ADR 023 e 035: versão real conferida)              (T1)
  architecture/arquitetura.md (§2.5 se algo divergir; §5 rotas)    (T1, T13)
```

---

### Tarefa 1: Dependências, `EventEmitterModule`, contratos de eventos e códigos de erro

Receitas: guia §3.10 (dependência), §3.11 (código de erro); arquitetura §2.4, §2.5; ADRs 023
e 035. Sem `CA` próprio: habilita CA-2.3, 2.6–2.10, 2.12, 2.14, 2.16, 2.21.

**Arquivos:**
- Modificar: `apps/api/package.json` (+ `pnpm-lock.yaml`), `apps/api/src/app.module.ts`,
  `apps/api/src/common/errors/error-codes.ts` (+ `.spec`),
  `packages/shared-types/src/error-codes.ts`, `apps/web/src/lib/api-errors.ts` (+ teste
  Vitest existente, se houver tabela), `docs/decisions.md` (ADR 023 e 035: só a linha da
  versão conferida e a data; o **status fica "Proposta"** para o usuário aceitar).
- Criar: `apps/api/src/scheduling/contracts/appointment-events.ts`.

**Passos de dependência (guia §3.10), com a saída colada no relatório:**
1. `npm view @nestjs/event-emitter@3.1.0 type exports main peerDependencies time --json` e
   `npm view libphonenumber-js@1.13.11 type exports main time --json`. Conferir: publicada há
   ≥ 14 dias em 2026-11-17, sem `"type": "module"` (ou com `exports.require`), peer
   `@nestjs/common@^11`.
2. `pnpm why libphonenumber-js` no `apps/api`: a versão resolvida pelo `class-validator` tem de
   ser a mesma da ADR 035. Se diferir, usar a resolvida e **anotar** na ADR (não decidir em
   silêncio: listar no relatório).
3. `pnpm --filter api add @nestjs/event-emitter@<exata> libphonenumber-js@<exata> -E`.
4. Teste descartável de import (`node -e "require('@nestjs/event-emitter'); require('libphonenumber-js')"`
   dentro de `apps/api`), apagado depois.
5. `@nestjs/schedule` **não** entra nesta fatia (jobs são da fatia 3).

**Contratos:**

```ts
// app.module.ts
imports: [ /* … */ EventEmitterModule.forRoot(), SchedulingModule ]   // wildcard desligado

// scheduling/contracts/appointment-events.ts — cópia fiel da arquitetura §2.4 (todos os
// nomes e interfaces, inclusive os das fatias 3–4: arquivo único). Nesta fatia só são
// emitidos Confirmed (T2), Rescheduled (T9), ContactUpdated (T13) e Cancelled (T7, T11).
export const AppointmentEvents = { Requested, Confirmed, Rejected, Cancelled, Expired,
  Rescheduled, ContactUpdated } as const;
export interface AppointmentConfirmed extends Base { via: 'DIRECT' | 'APPROVAL'; notifyPatient: boolean }
export interface AppointmentCancelled extends Base { reason: 'PATIENT'|'DENTIST'|'BLOCK'|'APPROVAL_TIMEOUT';
  previousStatus: 'PENDING'|'CONFIRMED'; notifyPatient: boolean }
export interface AppointmentRescheduled extends Base { from: {startAt; endAt}; to: {startAt; endAt}; notifyPatient: boolean }
export interface AppointmentContactUpdated extends Base {}
// Base = { appointmentId; auditEventId; occurredAt (ISO UTC do Clock); actor }
```

Códigos novos (status, mensagem da API fixa, mensagem do web em pt-BR):

| `code` | HTTP | `details` | Mensagem web (proposta) |
|---|---|---|---|
| `APPOINTMENT_OVERLAP` | 409 | `{ conflicts: [{ id, startAt, endAt, patientName, status }] }` | "Esse horário conflita com outro agendamento." |
| `INVALID_STATE` | 409 | `{ currentStatus }` | "Esse agendamento mudou enquanto você editava. Atualize a agenda." |
| `BLOCK_AFFECTED_CHANGED` | 409 | `{ affected: AffectedAppointmentDto[] }` | "A lista de agendamentos afetados mudou. Revise antes de confirmar." |
| `IDEMPOTENCY_KEY_REUSED` | 422 | — | "Esse envio já foi usado com outros dados. Recarregue o formulário." |
| `START_IN_PAST` | 422 | — | "Não é possível marcar ou mover para um horário que já passou." |
| `ALREADY_STARTED` | 422 | — | "Esse atendimento já começou; a ação não está mais disponível." |
| `OUTCOME_TOO_EARLY` | 422 | — | "Só dá para marcar concluído ou falta depois do início." |
| `INVALID_KEEP_IDS` | 422 | — | "Seleção de agendamentos a manter inválida. Abra a prévia de novo." |

- A linha de cada código **já existe** na arquitetura §2.5: conferir que bate com a tabela
  acima; se divergir, corrigir a arquitetura no mesmo trabalho e reportar.
- `APPOINTMENT_OVERLAP.details.conflicts[].patientName` é o `contactName` do conflitante
  (painel autenticado, RN-33). É a **única** exceção à regra "sem dado pessoal em `details`"
  (ver "Divergências").
- O e2e de status + `code` de cada código fica na tarefa que o lança (coluna "Dono" na tabela
  de cobertura): APPOINTMENT_OVERLAP/IDEMPOTENCY_KEY_REUSED/START_IN_PAST → T4;
  ALREADY_STARTED (remarcar) → T5; ALREADY_STARTED (contato)/INVALID_STATE → T6;
  OUTCOME_TOO_EARLY → T7; BLOCK_AFFECTED_CHANGED/INVALID_KEEP_IDS → T8.

**Testes de aceite (testador):**
- `error-codes.spec.ts` (já existe): todo `ErrorCode` tem status e mensagem; os 8 novos com
  os status da tabela; nenhuma mensagem contém `{`/interpolação.
- `api-errors` (Vitest): `messageFor(code)` dos 8 novos devolve o texto pt-BR (não o
  `DEFAULT_ERROR_MESSAGE`).
- Boot: `pnpm --filter api test:e2e -- smoke` (ou o e2e mais curto existente) sobe o
  `AppModule` com `EventEmitterModule` sem erro.

**Verificação:** `pnpm typecheck`, `pnpm --filter api test`, `pnpm --filter web test`,
`pnpm lint`, `git status --short` (o lint corrige). `pnpm --filter api build` e
`node apps/api/dist/main.js` **não** (não subir servidor): o import descartável basta.
Commit: `chore: event-emitter, libphonenumber-js e códigos de erro da fatia 2`.

---

### Tarefa 2: Domínio puro — telefone, edição de contato, regras de agendamento, avisos de encaixe, impacto de bloqueio

Receitas: guia §3.3, §3.4 (passo 1); arquitetura §2.3. Critérios (U): **CA-2.5** (avisos),
**CA-2.8**, **CA-2.10**, **CA-2.11/2.12/2.17** (parte pura), **CA-2.19/2.20** (parte
pura). As tags `[CA]` aqui são da camada U; a mesma tag aparece no int/e2e da tarefa dona.
RN-11, RN-15, RN-30–RN-38, RN-43.

> Spec: RN-35 "não cria nem move agendamento para um início no passado, e não remarca um
> agendamento que já começou. Sem tolerância." RN-36 "depois do início … `COMPLETED` ou
> `NO_SHOW`". RN-38 incluir e-mail → gera token; trocar → token novo; remover → nulo.
> RN-43 afetados = `PENDING`/`CONFIRMED` com `startAt > agora` que intersectam o bloqueio;
> em andamento (`startAt ≤ agora < endAt`) e passados ficam de fora.

**Arquivos:**
- Criar em `apps/api/src/scheduling/domain/` (cada um com `.spec.ts`): `phone.ts`,
  `contact-edit.ts`, `cancellation-token.ts`, `appointment-rules.ts`,
  `manual-slot-warnings.ts`, `block-impact.ts`.
- Modificar: nada fora de `domain/`. `DomainError` (de `common/errors/domain-error.ts`, sem
  `@nestjs/*`) pode ser lançado pelas guardas `assert*`.

**Contratos:**

```ts
// phone.ts — único importador de libphonenumber-js (ADR 035). País padrão BR.
export function normalizeBrPhone(raw: string): string | null;   // E.164 '+55…' ou null se não for BR válido

// contact-edit.ts — RN-11, RN-38
export function normalizeName(raw: string): string;             // trim (validação de tamanho é do DTO)
export function normalizeEmail(raw: string | null | undefined): string | null;  // trim + minúsculas; '' → null
export function normalizeNotes(raw: string | null | undefined): string | null;  // trim; '' → null
export function tokenEffect(oldEmail: string | null, newEmail: string | null)
  : 'KEEP' | 'GENERATE' | 'ROTATE' | 'CLEAR';                   // compara já normalizados
// RN-15 (Decisão 6): sinal "dados diferentes do cadastro". Só leitura; atualizar o cadastro é fatia 3.
export function patientDiffers(
  contact: { name: string; email: string | null },
  patient: { name: string; email: string | null },
): { name: boolean; email: boolean };
//  name: compara `foldName(contact.name) !== foldName(patient.name)`, com foldName = NFD sem marcas
//        diacríticas (U+0300–U+036F), espaços internos colapsados, trim e minúsculas. Logo
//        "José  da Silva" == "jose da silva" (acento e caixa não contam).
//  email: `contact.email === null` → false (dado omitido não é divergência); senão compara
//        `normalizeEmail` dos dois; paciente sem e-mail e agendamento com e-mail → true.

// cancellation-token.ts — spec 6.4: crypto.randomBytes(32) em base64url (43 chars)
export function generateCancellationToken(random?: (n: number) => Buffer): string;  // random injetável no teste

// appointment-rules.ts — guardas das transições da fatia 2 (lançam DomainError)
export function validateManualDuration(minutes: number): void;  // inteiro, múltiplo de MANUAL_STEP_MINUTES, 15..MANUAL_MAX_MINUTES → senão INVALID_DURATION
export function assertNewStartNotInPast(newStart: Date, now: Date): void;     // newStart ≤ now → START_IN_PAST (Decisão 2)
export function assertCanReschedule(a: { status; startAt: Date }, newStart: Date, now: Date): void;
//   status ≠ CONFIRMED → INVALID_STATE {currentStatus}; startAt ≤ now → ALREADY_STARTED; depois assertNewStartNotInPast
export function assertCanDentistCancel(a, now): void;   // ≠ CONFIRMED → INVALID_STATE; startAt ≤ now → ALREADY_STARTED
export function assertCanMarkOutcome(a, now): void;     // ≠ CONFIRMED → INVALID_STATE; now < startAt → OUTCOME_TOO_EARLY
export function assertCanEditContact(a, now): void;     // ≠ CONFIRMED → INVALID_STATE; startAt ≤ now → ALREADY_STARTED
//   (PENDING + prazo RN-26 → APPROVAL_EXPIRED entra na fatia 3, CA-3.34; aqui PENDING → INVALID_STATE
//    — não existe PENDING antes da fatia 3. Ordem: status antes do tempo, para CA-2.21.)
// Critério único de "já começou": startAt ≤ now. A guarda usa hasStarted(); o WHERE do
// repositório usa o complemento literal `startAt: { gt: now }` (T9, T11, T13) ou
// `startAt: { lte: now }` (T12) — o teste de corrida da tarefa dona prova que batem.
export function hasStarted(startAt: Date, now: Date): boolean;
// O que a tela pode oferecer — a MESMA regra das guardas (DRY; a tela não recalcula com o relógio do navegador):
export type DentistAction = 'RESCHEDULE' | 'CANCEL' | 'EDIT_CONTACT' | 'COMPLETE' | 'NO_SHOW';
export function allowedDentistActions(a: { status; startAt: Date }, now: Date): DentistAction[];
//   CONFIRMED futuro → [RESCHEDULE, CANCEL, EDIT_CONTACT]; CONFIRMED iniciado → [COMPLETE, NO_SHOW]; demais → []

// manual-slot-warnings.ts — RN-34 (reaproveita calendar-flags.ts)
export type ManualSlotWarning =
  | { kind: 'OUTSIDE_WORKING_HOURS' }
  | { kind: 'HOLIDAY'; holidayName: string }
  | { kind: 'IN_BLOCK'; blockId: string; reason: string | null; startAt: Date; endAt: Date };
export function manualSlotWarnings(i: { interval: Interval; weeklyHours: readonly WeeklyHoursRow[];
  blocks: readonly { id: string; start: Date; end: Date; reason: string | null }[];
  holidays: ReadonlyMap<LocalDate, string>; overrides: ReadonlySet<LocalDate>; timeZone: string })
  : ManualSlotWarning[];   // ordem fixa: HOLIDAY, OUTSIDE_WORKING_HOURS, IN_BLOCK (por startAt)

// block-impact.ts — RN-43
export interface BlockOccupant { id: string; status: string; start: Date; end: Date }
export function affectedByBlock(block: Interval, occupants: readonly BlockOccupant[], now: Date): string[];
//   status ∈ {PENDING, CONFIRMED} ∧ start > now ∧ [start,end) ∩ [block) ≠ ∅; ordenado por start
//   (exclusão de PENDING com prazo RN-26 vencido: fatia 3, junto com approvalDeadline)
export function validateKeepIds(affected: string[], sentAffected: string[], keep: string[])
  : 'OK' | 'STALE' | 'KEEP_NOT_SUBSET';
//   1º keep ⊄ sentAffected → KEEP_NOT_SUBSET (pedido malformado, independe do estado);
//   2º set(affected) ≠ set(sentAffected) → STALE; senão OK. Comparação de conjunto.
```

**Testes de aceite (testador), todos unit com `clinicInstant`:**
- `phone.spec.ts`, `describe('[RN-11] telefone brasileiro em E.164')`: a tabela do Foco da
  revisão item 2 (válidos → `+5511988887777` / `+553132221234`; inválidos → `null`).
  `it('[CA-2.2] …')`: `normalizeBrPhone('11988887777') === normalizeBrPhone('(11) 98888-7777') === '+5511988887777'`.
- `contact-edit.spec.ts`, `describe('[RN-38] efeito no token')`: `[CA-2.19]`
  `tokenEffect(null, 'maria@x.com') === 'GENERATE'`; `[CA-2.20]`
  `tokenEffect('a@x.com', 'b@x.com') === 'ROTATE'` e `tokenEffect('a@x.com', null) === 'CLEAR'`;
  sem tag: `(null, null) → KEEP`, `('maria@x.com', 'maria@x.com') → KEEP`;
  `normalizeEmail(' Maria@X.com ') === 'maria@x.com'`, `normalizeEmail('') === null`.
- `contact-edit.spec.ts`, `describe('[RN-15] dados diferentes do cadastro')` (sem CA próprio; a
  Tarefa 7 liga ao detalhe): `patientDiffers({name:'José  da Silva',email:null},{name:'jose da silva',email:null})`
  → `{name:false,email:false}`; `({name:'Maria Souza'},{name:'Maria S. Souza'})` → `name:true`;
  `({email:null},{email:'a@x.com'})` → `email:false`; `({email:'A@X.com'},{email:'a@x.com'})` →
  `email:false`; `({email:'b@x.com'},{email:'a@x.com'})` → `email:true`; `({email:'a@x.com'},{email:null})`
  → `email:true`.
- `cancellation-token.spec.ts`: com `random` fixo de 32 bytes `0x00` → `'A'.repeat(43)`;
  com o `randomBytes` real, 43 chars em `^[A-Za-z0-9_-]+$` e dois chamados diferentes.
- `appointment-rules.spec.ts`:
  - `describe('[RN-35] sem passado')`: `[CA-2.8]` now = seg 09/11 10:00;
    `assertNewStartNotInPast(clinicInstant('2026-11-09 09:59'), now)` lança `START_IN_PAST`;
    `assertCanReschedule({CONFIRMED, startAt: 09:30}, 11:00, now)` lança `ALREADY_STARTED`;
    `10:01` passa.
  - `describe('[RN-32] cancelar')`: `[CA-2.9]` `startAt = 10:00`, now 09:59 passa; now 10:00
    lança `ALREADY_STARTED`; status `CANCELLED` lança `INVALID_STATE` com
    `details.currentStatus = 'CANCELLED'`.
  - `describe('[RN-36] concluído/faltou')`: `[CA-2.10]` now 09:59 com `startAt` 10:00 →
    `OUTCOME_TOO_EARLY`; now 10:00 passa; status `COMPLETED` → `INVALID_STATE`.
    `allowedDentistActions`: now 09:59 → `['RESCHEDULE','CANCEL','EDIT_CONTACT']` (sem
    `NO_SHOW`); now 10:00 → `['COMPLETE','NO_SHOW']`; `CANCELLED` → `[]`. (`DentistAction`
    mora no `shared-types`.)
  - `describe('[RN-38] editar contato')`: `[CA-2.21]` `CONFIRMED` iniciado →
    `ALREADY_STARTED`; `CANCELLED`/`COMPLETED`/`NO_SHOW` (futuro ou passado) →
    `INVALID_STATE`.
  - `describe('[RN-30] duração manual')`: Foco item 1.
- `manual-slot-warnings.spec.ts`, `describe('[RN-34] encaixe avisa mas permite')`,
  `[CA-2.5]` com `DEFAULT_WEEKLY_HOURS` (segunda 08:00–11:00 e 13:30–17:00; sexta
  08:00–10:30) e 30 min: seg 09/11 11:30, 07:00 e 17:30 → `[OUTSIDE_WORKING_HOURS]`;
  sáb 14/11 10:00 → `[OUTSIDE_WORKING_HOURS]`; sex 20/11 09:00 (Consciência Negra) →
  `[{kind:'HOLIDAY', holidayName}]` e, com 20/11 desbloqueado, `[]`; seg 09/11 09:00 dentro
  de bloqueio 08:30–10:00 → `[IN_BLOCK]` com o `blockId`; seg 09/11 10:00 → `[]`;
  seg 10:45–11:15 (atravessa o fim da faixa) → `[OUTSIDE_WORKING_HOURS]`.
- `block-impact.spec.ts`, `describe('[RN-43] …')`:
  - `[CA-2.11]` ter 10/11, now = seg 09/11 08:00, bloqueio 13:30–16:30, A 13:30, B 14:30,
    C 16:00 (30 min) → `[A, B, C]`; um `CANCELLED` 15:00 e um 16:30–17:00 (encosta no fim,
    semiaberto) ficam de fora.
  - `[CA-2.17]` now = ter 10/11 14:10; 14:00–15:00 e 15:00–15:30 → só o de 15:00.
  - `[CA-2.12]` `validateKeepIds([A,B,C], [A,B], [])` → `STALE`; `([A], [A,B], [])` →
    `STALE`; `([A,B], [A,B], [X])` → `KEEP_NOT_SUBSET`; `([A,B], [B,A,A], [B,B])` → `OK`.
  - Foco item 5 (meia-noite) e item 7 (conjunto vazio → `OK`).

**Verificação:** `pnpm --filter api test -- domain`, `pnpm typecheck`, `pnpm lint`,
`git status --short`. Conferir com `rg "@nestjs|@prisma|new Date\(|Date\.now|luxon" apps/api/src/scheduling/domain`
→ nenhuma ocorrência nova (o `rg` de `libphonenumber-js` só acha `phone.ts`).
Commit: `feat: regras puras da agenda da dentista (telefone, contato, transições, encaixe, bloqueio)`.

### Tarefa 3: Repositório de agendamento, `AppointmentEvent` e paciente (lookup/dedup)

Receitas: guia §3.4 (passos 2–3), §3.1 (passo 4); arquitetura §2.8; spec §5 (último
parágrafo) e §6.7. Sem `CA` próprio: é a base de "uma linha de `AppointmentEvent` por
transição, na mesma transação" (escopo da fatia: trilha de auditoria), cobrada pelos CA-2.6,
2.9, 2.11, 2.18 nas tarefas donas.

**Arquivos:**
- Criar: `apps/api/src/scheduling/infra/appointment.repository.ts`,
  `apps/api/src/scheduling/infra/patient.repository.ts`,
  `apps/api/test/support/events.ts`,
  `apps/api/test/integration/scheduling/appointment-repository.int-spec.ts`.
- Modificar: `apps/api/src/scheduling/scheduling.module.ts` (providers),
  `apps/api/test/support/factories.ts` (`makeAppointment` aceita `patientId?`, `notes?`,
  `cancellationToken?`, `idempotencyKey?`; novo `makeEmailAppointment` só se simplificar —
  nada de helper que esconda o "Dado").

**Contratos:**

```ts
type Db = Prisma.TransactionClient | PrismaService;   // leitura fora ou dentro da tx

// infra/patient.repository.ts — o telefone já chega em E.164 (domain/phone.ts)
findByPhone(db: Db, phone: string): Promise<PatientRecord | null>;
create(tx, p: { name: string; phone: string; email: string | null }): Promise<PatientRecord>;
// PatientRecord = { id, name, phone, email }

// infra/appointment.repository.ts
insertConfirmedDirect(tx, a: { professionalId; patientId; serviceId: string | null;
  startAt; endAt; contactName; contactEmail: string | null; notes: string | null;
  cancellationToken: string | null; idempotencyKey: string; now: Date }): Promise<AppointmentRecord>;
//   status CONFIRMED, source DENTIST, confirmedAt = now. NÃO captura erro: o caso de uso
//   trata isOverlapViolation / isUniqueViolation(err, 'idempotencyKey') fora da tx.
findById(db: Db, professionalId: string, id: string): Promise<AppointmentRecord | null>;
findByIdempotencyKey(db: Db, professionalId: string, key: string)
  : Promise<(AppointmentRecord & { patientPhone: string }) | null>;
findOccupyingIn(db: Db, professionalId: string, from: Date, to: Date, excludeId?: string)
  : Promise<ConflictRecord[]>;   // { id, startAt, endAt, contactName, status } — para o 409 e a prévia
transition(tx, t: {
  professionalId: string; id: string;
  from: AppointmentStatus[];                 // status de origem aceitos
  startAt?: { gt: Date } | { lte: Date };    // guarda de tempo com o now da aplicação
  data: Prisma.AppointmentUpdateManyMutationInput;
  event: { type: AppointmentEventType; actor: CancelledBy; toStatus: AppointmentStatus;
           fromStartAt?; fromEndAt?; toStartAt?; toEndAt? };   // fromStatus = lido da linha
}): Promise<{ ok: true; auditEventId: string } | { ok: false; current: AppointmentRecord | null }>;
//   updateMany({ where: { id, professionalId, status: { in: from }, startAt? }, data });
//   count === 1 → INSERT AppointmentEvent (mesma tx) e devolve o id; count === 0 → relê
//   (null = não existe). Quem escolhe o erro (NOT_FOUND / INVALID_STATE / ALREADY_STARTED …)
//   é o caso de uso, reaplicando a guarda pura sobre `current`.
recordEvent(tx, e: NewAppointmentEvent): Promise<{ id: string }>;   // usado por T2 (sem updateMany)
// AppointmentRecord = { id, professionalId, patientId, serviceId, status, source, startAt,
//   endAt, contactName, contactEmail, notes, cancellationToken, confirmedAt, cancelledBy,
//   cancelReason, closedAt, idempotencyKey }
```

- `fromStatus` do evento: a transição lê o status de origem **antes** do `updateMany` só se
  houver mais de um em `from`; com um só, é ele. O `AppointmentEvent` não leva nome,
  telefone, e-mail, observação nem token (spec §6.7).
- `test/support/events.ts`: `captureEvents(app): { list(): { name: string; payload: unknown }[] }`
  espiando `EventEmitter2.emitAsync` (`jest.spyOn`, chamando o original).

**Testes de aceite (testador), `appointment-repository.int-spec.ts`,
`describe('[RN-33] … / spec 5 transição condicional')`, sem tag `[CA]`:**
- `transition` com status certo → `ok: true`, linha alterada e **exatamente um**
  `AppointmentEvent` com `fromStatus`, `toStatus`, `actor`, `type` corretos.
- `transition` com status errado ou guarda `startAt: { gt: now }` falhando → `ok: false`,
  `current.status` atual, **zero** `AppointmentEvent`, linha intacta.
- Atomicidade: dentro de `$transaction`, `transition` ok e depois `throw` → rollback: linha
  intacta e zero eventos.
- Corrida: duas `transition` CONFIRMED→CANCELLED no mesmo id em `Promise.allSettled`, cada
  uma na sua tx → uma `ok: true`, uma `ok: false`, um único `AppointmentEvent`. Repetir 20×
  (guia §4.6).
- `insertConfirmedDirect` sobre um ocupante → o erro satisfaz `isOverlapViolation`; com
  `idempotencyKey` repetida → `isUniqueViolation(err, 'idempotencyKey')`.
- `findOccupyingIn` ignora `CANCELLED`/`REJECTED`/`EXPIRED`, respeita `[início, fim)` e
  `excludeId`.

**Verificação:** `pnpm --filter api test:int -- appointment-repository` (repetido 20× para a
corrida), `pnpm typecheck`, `pnpm lint`, `git status --short`.
Commit: `feat: repositório de agendamento com transição condicional e trilha de auditoria`.

---

### Tarefa 4: T2 — marcação direta, prévia e busca de paciente

Receitas: guia §3.1, §3.4, §3.11 (e2e dos códigos); arquitetura §2.7, §2.8, §3.5, §5.
Critérios: **CA-2.1** (I + E), **CA-2.2** (I + E), **CA-2.3** (I + E), **CA-2.16** (I + E,
dono), **CA-2.8** (parte "criar", E), **CA-2.5** (parte API: aceito + avisos na prévia, E).
RN-11, RN-15, RN-17, RN-30, RN-33, RN-34, RN-35, RN-37.

> Spec: T2 `∅ → CONFIRMED`, guarda RN-30/33/35, efeitos `confirmedAt = agora`, token só se
> houver e-mail, evento `appointment.confirmed`. RN-30: obrigatórios nome e telefone;
> e-mail e procedimento opcionais (sem procedimento: passos de 15, padrão 30); exige
> `idempotencyKey`. RN-15: telefone existente → reaproveita o `Patient` **sem alterar**
> nome/e-mail; dados digitados ficam no agendamento. RN-33: 409 com os conflitantes
> (horário e nome). CA-2.16: mesma chave duas vezes → um agendamento, respostas iguais; sem
> chave 400; mesma chave com outro horário 422.

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/{direct-booking,appointment-preview,patient-lookup}.service.ts`,
  `apps/api/src/scheduling/http/dentist/{appointments,patients}.controller.ts`,
  `apps/api/src/scheduling/http/dto/{create-appointment,appointment-preview,patient-lookup}.dto.ts`,
  `apps/api/src/scheduling/http/dto/is-br-phone.validator.ts`,
  `apps/api/src/scheduling/http/presenters/appointment.presenter.ts`,
  `packages/shared-types/src/appointments.ts` (+ `index.ts`; Zod em `schemas.ts` para o web),
  `apps/api/test/integration/scheduling/direct-booking.int-spec.ts`,
  `apps/api/test/e2e/scheduling/appointments-create.e2e-spec.ts`.
- Modificar: `scheduling.module.ts`, `routes-require-session.e2e-spec.ts`
  (`POST /appointments/preview`, `POST /appointments`, rota de busca de paciente),
  `docs/architecture/arquitetura.md` §5 (rota de busca de paciente passa a `POST /patients/lookup`).

**Contratos:**

```ts
// shared-types/appointments.ts
export interface CreateAppointmentRequest {
  idempotencyKey: string;             // UUID, obrigatória (400 sem ela)
  startAt: string;                    // ISO com Z/offset
  serviceId?: string;                 // ativo; senão 422 PROCEDURE_INACTIVE
  durationMinutes?: number;           // omitido → do procedimento, ou 30 sem procedimento (Decisão 4)
  name: string; phone: string;        // NAME_MIN..NAME_MAX, sem controle; BR válido
  email?: string | null;              // ≤ EMAIL_MAX, sem CR/LF
  notes?: string | null;              // ≤ NOTES_MAX
  notifyPatient: boolean;             // RN-37 (vai só no payload do evento nesta fatia)
}
export interface AppointmentDto {
  id: string; status: AppointmentStatusName; source: 'PUBLIC' | 'DENTIST';
  startAt: string; endAt: string; serviceId: string | null; procedureName: string | null;
  contactName: string; contactEmail: string | null; notes: string | null;
  patient: { id: string; name: string; phone: string; email: string | null };
  patientDiffers: { name: boolean; email: boolean };   // RN-15 (sinal; ação de atualizar é fatia 3)
  confirmedAt: string | null; cancelledBy: string | null; cancelReason: string | null; closedAt: string | null;
  allowedActions: DentistAction[];    // allowedDentistActions(a, clock.now()) — a tela só mostra o que a API aceitaria
}   // sem cancellationToken (o painel não precisa dele)
export interface AppointmentPreviewRequest { startAt: string; durationMinutes: number; excludeAppointmentId?: string }
export interface ConflictDto { id: string; startAt: string; endAt: string; patientName: string; status: string }
export type SlotWarningDto =
  | { kind: 'OUTSIDE_WORKING_HOURS' } | { kind: 'HOLIDAY'; holidayName: string }
  | { kind: 'IN_BLOCK'; blockId: string; reason: string | null; startAt: string; endAt: string };
export interface AppointmentPreviewResponse { startAt: string; endAt: string; warnings: SlotWarningDto[]; conflicts: ConflictDto[] }
export interface PatientLookupResponse { patient: { id: string; name: string; phone: string; email: string | null } | null }

// application/direct-booking.service.ts
create(professionalId: string, req: CreateAppointmentRequest): Promise<AppointmentDto>;
//  1 normaliza (phone → normalizeBrPhone, null → VALIDATION_FAILED {fields:['phone']}; nome, e-mail, notes)
//  2 resolve duração (serviceId ativo? senão PROCEDURE_INACTIVE) → validateManualDuration
//  3 now = clock.now(); assertNewStartNotInPast(startAt, now)
//  4 busca pela chave (fora da tx): igual → devolve o existente (sem evento); diferente → IDEMPOTENCY_KEY_REUSED
//  5 $transaction({timeout, maxWait}): lockSchedule → repete o passo 4 → patient (findByPhone ?? create)
//    → token = email ? generateCancellationToken() : null → insertConfirmedDirect → recordEvent(CONFIRMED, DENTIST,
//    fromStatus null, toStartAt/toEndAt)
//  6 catch fora da tx: isOverlapViolation → findOccupyingIn → DomainError('APPOINTMENT_OVERLAP', {conflicts});
//    isUniqueViolation(…'idempotencyKey') → relê e aplica o passo 4; isUniqueViolation(…'phone') → refaz uma vez
//  7 depois do commit: emitAsync(Confirmed, { via: 'DIRECT', notifyPatient: req.notifyPatient && !!email, actor: 'DENTIST', auditEventId, … })
// "Mesmo conteúdo" (arquitetura 2.7): startAt, duração, serviceId, telefone E.164, contactName, contactEmail, notes — normalizados.

// application/appointment-preview.service.ts — sem escrita, sem lock
preview(professionalId, req: AppointmentPreviewRequest): Promise<AppointmentPreviewResponse>;
//  validateManualDuration; assertNewStartNotInPast; avisos = manualSlotWarnings (horário semanal, bloqueios,
//  feriados dos anos do intervalo, desbloqueios); conflitos = findOccupyingIn(…, excludeAppointmentId)

// application/patient-lookup.service.ts
lookup(phoneRaw: string): Promise<PatientLookupResponse>;   // inválido → VALIDATION_FAILED {fields:['phone']}
```

- Rotas (`appointments.controller.ts`, `patients.controller.ts`): `POST /appointments/preview`
  (200), `POST /appointments` (201 na criação **e** na repetição idempotente — mesma
  resposta, CA-2.16), busca de paciente (200). **Decidido (Decisão 5):** `POST /patients/lookup
  { phone }`, nunca `GET`: a arquitetura §5 dizia `GET /patients/lookup?phone=`, o que poria o
  telefone na URL (log do `pino-http`, histórico, `Referer`; proibido pelo CLAUDE.md §4.1). A
  Tarefa 13 corrige a arquitetura §5.
- DTO: `@IsUUID('4') idempotencyKey`; `@IsIsoInstant startAt`; `@IsOptional @IsUUID serviceId`;
  `@IsOptional @IsInt durationMinutes` (a regra 15/480 é do domínio → 422, não 400);
  `@Length(NAME_MIN, NAME_MAX) @NoControlChars name` (após trim: o caso de uso revalida);
  `@IsBrPhone phone`; `@IsOptional @IsEmail @MaxLength(EMAIL_MAX) @NoControlChars email`;
  `@IsOptional @MaxLength(NOTES_MAX) notes` com controle recusado (Decisão 3 sobre
  `\n`); `@IsBoolean notifyPatient`. Sem `professionalId`, sem `status`, sem `source`.
- `@IsBrPhone()` usa `normalizeBrPhone` de `domain/phone.ts` (não importa
  `libphonenumber-js`).

**Testes de aceite (testador):**
- `direct-booking.int-spec.ts` (serviço real, `FixedClock` em seg 09/11 08:00):
  - `describe('[RN-30] marcação direta')`, `[CA-2.1]`: "Maria", `(11) 98888-7777`, sem
    e-mail, seg 09/11 10:00, procedimento de 30 min → `Patient` com `phone = '+5511988887777'`,
    `email = null`; agendamento `status = 'CONFIRMED'`, `source = 'DENTIST'`,
    `startAt = clinicInstant('2026-11-09 10:00')`, `endAt = … 10:30`,
    `confirmedAt = now`, `cancellationToken = null`; um `AppointmentEvent`
    `{ type: CONFIRMED, actor: DENTIST, fromStatus: null, toStatus: CONFIRMED }`; um evento
    `appointment.confirmed` com `via: 'DIRECT'`, `notifyPatient: false`, `auditEventId` =
    id do `AppointmentEvent`, e payload **sem** `contactName`/`phone`/`email`. Com e-mail
    `maria@x.com`: token de 43 chars.
  - `describe('[RN-15] deduplicação por telefone')`, `[CA-2.2]`: `Patient`
    `+5511988887777` "Maria Antiga", e-mail `antiga@x.com`; marcar com `11988887777`, nome
    "Maria Nova", e-mail `nova@x.com` → `patient.count()` = 1; `Patient.name`/`email`
    inalterados; agendamento com `contactName = 'Maria Nova'`, `contactEmail = 'nova@x.com'`.
  - `describe('[RN-33] nunca sobrepor')`, `[CA-2.3]`: `CONFIRMED` 09:00–10:00 de "Ana";
    marcar 09:30–10:00 → `DomainError` `APPOINTMENT_OVERLAP` com
    `details.conflicts = [{ id, startAt: 09:00, endAt: 10:00, patientName: 'Ana', status: 'CONFIRMED' }]`;
    `appointment.count()` e `patient.count()` inalterados (o paciente novo também sofre
    rollback); nenhum evento emitido.
  - `describe('[RN-17] idempotência')`, `[CA-2.16]`: mesma chave e mesmo corpo em
    `Promise.all` → um agendamento, respostas `toEqual`, um `AppointmentEvent`, um evento
    emitido; mesma chave com `startAt` 11:00 → `IDEMPOTENCY_KEY_REUSED` e nada criado.
    Repetir o `Promise.all` 20×.
  - Foco item 2 (telefones equivalentes → um `Patient`).
- `appointments-create.e2e-spec.ts` (HTTP, sessão da dentista):
  - `[CA-2.1]` `POST /appointments` → 201 com `AppointmentDto` (`status: 'CONFIRMED'`,
    sem `cancellationToken` no corpo).
  - `[CA-2.2]` busca de paciente com `11988887777` → `{ patient: { phone: '+5511988887777', … } }`;
    telefone sem cadastro → `{ patient: null }`.
  - `[CA-2.3]` → 409 `APPOINTMENT_OVERLAP` com `details.conflicts[0].patientName`.
  - `[CA-2.5]` seg 09/11 às 11:30, 07:00 e 17:30, sáb 14/11 10:00, sex 20/11 09:00 e dentro
    de um bloqueio → `POST /appointments` 201 em todos; `POST /appointments/preview` para os
    mesmos → `warnings` com o `kind` esperado (tabela da Tarefa 2) e `conflicts: []`.
  - `[CA-2.8]` `startAt` = now − 1 min → 422 `START_IN_PAST`, nada criado; na prévia também
    422.
  - `[CA-2.16]` sem `idempotencyKey` → 400 `VALIDATION_FAILED` com `fields` contendo
    `idempotencyKey`; dois POST iguais → corpos iguais; chave repetida com outro horário →
    422 `IDEMPOTENCY_KEY_REUSED`.
  - Foco itens 1, 2, 3: duração inválida → 422 `INVALID_DURATION`; telefones inválidos → 400;
    controle em `name`/`notes`/`email` → 400; `serviceId` desativado → 422
    `PROCEDURE_INACTIVE`; corpo com `professionalId` ou `status` → 400.
  - Prévia sem conflito e sem aviso (seg 10:00) → `{ warnings: [], conflicts: [] }`.

**Verificação:** `pnpm --filter api test:int -- direct-booking`, `pnpm --filter api test:e2e -- appointments-create routes-require-session`,
`pnpm --filter api test:int -- -t "CA-2.16]"` 20× (guia §4.6), `pnpm typecheck`,
`pnpm lint`, `git status --short`. Revisor: modelo `fable` (concorrência + idempotência).
Commit: `feat: marcação direta com deduplicação por telefone e idempotência`.

### Tarefa 5: T9 — remarcar e redimensionar

Receitas: guia §3.1, §3.4, §3.11; arquitetura §2.8 (sem lock), §5. Critérios: **CA-2.6**
(I + E, dono da API), **CA-2.7** (I + E, dono), **CA-2.8** (I + E, dono: "mover" e
"criar" juntos no e2e). RN-31, RN-33, RN-34, RN-35, RN-40.

> Spec: T9 `CONFIRMED → CONFIRMED`, guarda RN-31/33/35, muda `startAt`/`endAt`/`serviceId`,
> evento `appointment.rescheduled`; "T9 grava um único evento `rescheduled` com início e fim
> de antes e depois, cobrindo remarcar e redimensionar". RN-31: qualquer `CONFIRMED` futuro.
> RN-35: não move para o passado nem remarca o que já começou. RN-34: encaixe vale também na
> remarcação.

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/reschedule-appointment.service.ts`,
  `apps/api/src/scheduling/http/dto/reschedule-appointment.dto.ts`,
  `apps/api/test/integration/scheduling/reschedule.int-spec.ts`,
  `apps/api/test/e2e/scheduling/appointments-reschedule.e2e-spec.ts`.
- Modificar: `appointments.controller.ts`, `scheduling.module.ts`, `shared-types/appointments.ts`,
  `routes-require-session.e2e-spec.ts` (`PATCH /appointments/:id/schedule`).

**Contratos:**

```ts
export interface RescheduleAppointmentRequest {
  startAt: string; durationMinutes: number;
  serviceId?: string | null;   // omitido = mantém; null = sem procedimento; outro id = precisa estar ativo
  notifyPatient: boolean;
}
reschedule(professionalId, id, req): Promise<AppointmentDto>;
//  now; a = findById ?? NOT_FOUND; assertCanReschedule(a, newStart, now); validateManualDuration
//  serviceId ≠ atual e (inexistente ou inativo) → PROCEDURE_INACTIVE (manter o atual desativado é ok)
//  mesmo início, fim e serviceId → devolve como está, sem evento (Decisão 1)
//  $transaction (SEM lockSchedule): transition({ from: ['CONFIRMED'], startAt: { gt: now },
//    data: { startAt, endAt, serviceId }, event: { type: RESCHEDULED, actor: DENTIST, toStatus: CONFIRMED,
//    fromStartAt, fromEndAt, toStartAt, toEndAt } })
//  ok: false → reaplica assertCanReschedule em `current` (INVALID_STATE / ALREADY_STARTED); null → NOT_FOUND
//  isOverlapViolation (fora da tx) → findOccupyingIn(…, excludeId = id) → APPOINTMENT_OVERLAP {conflicts}
//  depois do commit: emitAsync(Rescheduled, { from, to, notifyPatient: req.notifyPatient && !!a.contactEmail, … })
```

- Rota: `PATCH /appointments/:id/schedule` (200, `AppointmentDto`). `:id` com
  `ParseUUIDPipe` (id malformado → 400, não 500).

**Testes de aceite (testador):**
- `reschedule.int-spec.ts` (now = seg 09/11 08:00):
  - `describe('[RN-31] remarcar e redimensionar')`, `[CA-2.6]`: `CONFIRMED` 09:00–09:30 →
    `startAt` 15:00, 30 min → `15:00–15:30`, `status = 'CONFIRMED'`, exatamente um
    `AppointmentEvent` `RESCHEDULED` com `fromStartAt 09:00`, `fromEndAt 09:30`,
    `toStartAt 15:00`, `toEndAt 15:30`; um evento `appointment.rescheduled` com `from`/`to`
    em ISO. Depois, 15:00 com 75 min → `15:00–16:15` e o segundo evento também é
    `RESCHEDULED` (total 2).
  - `describe('[RN-33] …')`, `[CA-2.7]`: A 09:00–09:30, B 09:30–10:00; A com 60 min → 409
    `APPOINTMENT_OVERLAP` com `conflicts = [B]` (A não aparece), A inalterado, zero eventos
    novos; B → 10:00; A com 60 min de novo → ok `09:00–10:00`.
  - `describe('[RN-35] …')`, `[CA-2.8]`: now = seg 09/11 10:00; `CONFIRMED` 09:30 →
    `ALREADY_STARTED`; `CONFIRMED` 11:00 → `startAt` 09:59 → `START_IN_PAST`.
  - Foco item 4 (mesmo horário → sem evento) e item 6 (procedimento desativado).
  - Corrida: duas remarcações do mesmo agendamento para horários diferentes em
    `Promise.allSettled` → ambas podem vencer (não há conflito de estado), mas o
    agendamento termina num dos dois horários e há exatamente um `AppointmentEvent` por
    remarcação aplicada (o `fromStartAt` do 2º = `toStartAt` do 1º). 20×.
- `appointments-reschedule.e2e-spec.ts`: `[CA-2.6]` 200 com o novo horário; `[CA-2.7]` 409
  com `code` e `details.conflicts[0].id = B`; `[CA-2.8]` 422 `ALREADY_STARTED` e 422
  `START_IN_PAST` (no mesmo `describe` do e2e de criação da Tarefa 4); encaixe (sábado) →
  200; duração 25 → 422 `INVALID_DURATION`; id inexistente → 404 `NOT_FOUND`; id
  `CANCELLED` → 409 `INVALID_STATE` com `details.currentStatus`.

**Verificação:** `pnpm --filter api test:int -- reschedule` (20× a corrida),
`pnpm --filter api test:e2e -- appointments-reschedule routes-require-session`,
`pnpm typecheck`, `pnpm lint`, `git status --short`. Revisor: `fable`.
Commit: `feat: remarcar e redimensionar agendamento confirmado`.

---

### Tarefa 6: T13 — editar contato e observação

Receitas: guia §3.1, §3.4; arquitetura §2.8 (edição de contato). Critérios: **CA-2.18**,
**CA-2.19**, **CA-2.20**, **CA-2.21** (todos I + E; dona). RN-11, RN-38.

> Spec: T13 `PENDING`/`CONFIRMED` → mesmo status, `agora < startAt`; muda
> `contactName`/`contactEmail`/`notes`; gera/rotaciona/anula token (RN-38); evento
> `appointment.contact_updated`; nenhum e-mail. CA-2.21: já iniciado → 422
> `ALREADY_STARTED`; encerrado → 409 `INVALID_STATE`; corpo com `phone` → 400.

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/edit-appointment-contact.service.ts`,
  `apps/api/src/scheduling/http/dto/edit-contact.dto.ts`,
  `apps/api/test/integration/scheduling/edit-contact.int-spec.ts`,
  `apps/api/test/e2e/scheduling/appointments-contact.e2e-spec.ts`.
- Modificar: `appointments.controller.ts`, `scheduling.module.ts`, `shared-types/appointments.ts`,
  `routes-require-session.e2e-spec.ts` (`PATCH /appointments/:id/contact`).

**Contratos:**

```ts
export interface EditContactRequest {
  contactName?: string;            // NAME_MIN..NAME_MAX, sem controle
  contactEmail?: string | null;    // null ou '' = remover
  notes?: string | null;
}   // sem phone: forbidNonWhitelisted → 400. Corpo sem nenhum dos três → 400 VALIDATION_FAILED.
editContact(professionalId, id, req): Promise<AppointmentDto>;
//  now; a = findById ?? NOT_FOUND; assertCanEditContact(a, now)
//  normaliza; nada mudou → devolve como está, sem evento (Decisão 1)
//  effect = tokenEffect(a.contactEmail, novoEmail): GENERATE/ROTATE → generateCancellationToken(); CLEAR → null; KEEP → não toca
//  $transaction (sem lock): transition({ from: ['CONFIRMED'], startAt: { gt: now },
//    data: { contactName, contactEmail, notes, cancellationToken? },
//    event: { type: CONTACT_UPDATED, actor: DENTIST, toStatus: CONFIRMED } })   // sem valores no evento
//  ok: false → reaplica assertCanEditContact (INVALID_STATE / ALREADY_STARTED)
//  depois do commit: emitAsync(ContactUpdated, base)   // nenhum e-mail, nenhuma Notification
//  Patient NÃO é tocado (RN-38; atualizar cadastro é a ação da RN-15, fatia 3).
```

**Testes de aceite (testador):**
- `edit-contact.int-spec.ts`:
  - `describe('[RN-38] editar contato e observação')`, `[CA-2.18]`: `CONFIRMED` futuro de um
    `Patient` "Maria"; `contactName: 'Maria Souza'`, `notes: 'Trazer exame'` → agendamento
    com os novos valores; `Patient` idêntico ao de antes (`toEqual` do registro inteiro);
    um `AppointmentEvent` `CONTACT_UPDATED` com `fromStartAt`…`toEndAt` nulos; um evento
    `appointment.contact_updated` sem os valores; `notification.count() === 0`.
  - `[CA-2.19]`: sem e-mail e sem token; `contactEmail: 'maria@x.com'` → token de 43 chars;
    `notification.count() === 0`.
  - `[CA-2.20]`: com e-mail e token T1; troca para `outra@x.com` → token T2 ≠ T1 e
    `appointment.findUnique({ where: { cancellationToken: T1 } })` é `null`; depois
    `contactEmail: null` → token `null`. Trocar só a caixa (`MARIA@X.COM` → normaliza para
    o mesmo) → token **mantido**.
  - `[CA-2.21]`: now depois do início → `ALREADY_STARTED`; `CANCELLED`, `COMPLETED` e
    `NO_SHOW` → `INVALID_STATE`; nada muda, zero eventos.
  - Corrida: edição e cancelamento (`Promise.allSettled`, via repositório) — o resultado é
    consistente com a ordem: se o cancelamento veio antes, a edição dá `INVALID_STATE`.
- `appointments-contact.e2e-spec.ts`: `[CA-2.18]` 200; `[CA-2.21]` 422 `ALREADY_STARTED`, 409
  `INVALID_STATE`, e corpo `{ phone: '+5511999990000' }` → 400 `VALIDATION_FAILED` com
  `fields` contendo `phone`; corpo `{}` → 400; Foco item 3 (controle em nome/e-mail/notas
  → 400); `contactEmail: 'invalido'` → 400.

**Verificação:** `pnpm --filter api test:int -- edit-contact`,
`pnpm --filter api test:e2e -- appointments-contact routes-require-session`, `pnpm typecheck`,
`pnpm lint`, `git status --short`.
Commit: `feat: edição de contato e observação com rotação do token`.

---

### Tarefa 7: T11 cancelar, T12 concluído/falta e detalhe do agendamento

Receitas: guia §3.1, §3.4; arquitetura §2.4, §2.8. Critérios: **CA-2.9** (I + E, dona da
API), **CA-2.10** (I + E, dona da API), **CA-2.14** (I + E, dona). RN-15 (sinal de
divergência no detalhe), RN-32, RN-36, RN-37.

> Spec: T11 `CONFIRMED → CANCELLED`, `agora < startAt`, `cancelledBy = DENTIST`,
> `cancelReason = DENTIST`, `closedAt`; evento `appointment.cancelled`. T12
> `CONFIRMED → COMPLETED/NO_SHOW`, `agora ≥ startAt`, sem evento de domínio (mas grava
> `AppointmentEvent` — "cada transição T1–T13 grava uma linha"). CA-2.14: uma aba moveu, a
> outra cancela → cancelamento de `CONFIRMED` é válido; uma cancelou, a outra move → 409 com
> o estado atual.

**Arquivos:**
- Criar: `apps/api/src/scheduling/application/{cancel-appointment,mark-appointment-outcome,appointment-detail}.service.ts`,
  `apps/api/src/scheduling/http/dto/cancel-appointment.dto.ts`,
  `apps/api/test/integration/scheduling/{cancel,outcome,two-tabs}.int-spec.ts`,
  `apps/api/test/e2e/scheduling/appointments-actions.e2e-spec.ts`.
- Modificar: `appointments.controller.ts`, `scheduling.module.ts`,
  `routes-require-session.e2e-spec.ts` (`POST /appointments/:id/cancel`,
  `POST /appointments/:id/complete`, `POST /appointments/:id/no-show`,
  `GET /appointments/:id`).

**Contratos:**

```ts
export interface CancelAppointmentRequest { notifyPatient: boolean }
cancel(professionalId, id, req): Promise<AppointmentDto>;
//  transition({ from: ['CONFIRMED'], startAt: { gt: now }, data: { status: CANCELLED, cancelledBy: DENTIST,
//    cancelReason: DENTIST, cancelledAt: now, closedAt: now }, event: { type: CANCELLED, actor: DENTIST, toStatus: CANCELLED } })
//  ok: false → assertCanDentistCancel(current) ; depois do commit emitAsync(Cancelled, { reason: 'DENTIST',
//    previousStatus: 'CONFIRMED', notifyPatient: req.notifyPatient && !!a.contactEmail })
complete(professionalId, id): Promise<AppointmentDto>;   // from CONFIRMED, startAt: { lte: now } → COMPLETED
noShow(professionalId, id): Promise<AppointmentDto>;     // idem → NO_SHOW. Nenhum emit (T12). closedAt NÃO é preenchido (não é expurgável)
//  ok: false → assertCanMarkOutcome(current) → OUTCOME_TOO_EARLY / INVALID_STATE
detail(professionalId, id): Promise<AppointmentDto>;     // qualquer status; de outra profissional ou inexistente → NOT_FOUND
//  patientDiffers = patientDiffers(contact, patient) da Tarefa 2 (Decisão 6: sem acento/caixa/espaços extras; e-mail nulo no agendamento não diverge)
```

- Rotas: `POST /appointments/:id/cancel` (200), `POST /appointments/:id/complete` (200),
  `POST /appointments/:id/no-show` (200, corpo `{}` — mutação exige JSON),
  `GET /appointments/:id` (200).

**Testes de aceite (testador):**
- `cancel.int-spec.ts`, `describe('[RN-32] cancelar pela dentista')`, `[CA-2.9]`: now = dom
  01/11 12:00 (`BASE_NOW`); `CONFIRMED` seg 09/11 09:00 com procedimento de 30 min →
  `status CANCELLED`, `cancelledBy DENTIST`, `cancelReason DENTIST`, `closedAt = now`,
  `cancelledAt = now`; um `AppointmentEvent` `CANCELLED`; um evento `appointment.cancelled`
  com `reason: 'DENTIST'`, `previousStatus: 'CONFIRMED'`; o motor (`AvailabilityService`
  da fatia 1, mesmo `serviceId`) volta a oferecer 09:00 de 09/11. Com now = 09:00 do dia →
  `ALREADY_STARTED`, nada muda.
- `outcome.int-spec.ts`, `describe('[RN-36] concluído/faltou')`, `[CA-2.10]`: now = 09:00
  (igual ao início) → `noShow` ok, `status NO_SHOW`, `closedAt null`, um `AppointmentEvent`
  `NO_SHOW`, nenhum evento emitido; now = 08:59 → `OUTCOME_TOO_EARLY`. `complete` análogo
  (sem tag). `NO_SHOW` → `complete` → `INVALID_STATE`.
- `two-tabs.int-spec.ts`, `describe('[RN-31] [RN-32] duas abas')`, `[CA-2.14]`: (a) aba 1
  remarca 09:00 → 15:00; aba 2 cancela → ok, `CANCELLED` (2 eventos: `RESCHEDULED`,
  `CANCELLED`). (b) aba 1 cancela; aba 2 remarca → `INVALID_STATE` com
  `details.currentStatus = 'CANCELLED'`, horário inalterado. (c) concorrente
  (`Promise.allSettled` cancelar × remarcar) → estado final coerente com o número de
  `AppointmentEvent` (1 ou 2) e nunca `CANCELLED` com horário de "depois" sem o evento
  `RESCHEDULED` correspondente. 20×.
- `appointments-actions.e2e-spec.ts`: `[CA-2.9]` 200 e, depois,
  `GET /public/availability?from=2026-11-09&to=2026-11-09&serviceId=…` contém 09:00;
  cancelar já iniciado → 422 `ALREADY_STARTED`. `[CA-2.10]` antes do início → 422
  `OUTCOME_TOO_EARLY`; depois → 200 `NO_SHOW`. `[CA-2.14]` cancelar e depois `PATCH …/schedule`
  → 409 `INVALID_STATE`, `details.currentStatus = 'CANCELLED'`. `GET /appointments/:id` →
  `AppointmentDto` com `patient` e `patientDiffers`; id de outro formato → 400; inexistente
  → 404.

**Verificação:** `pnpm --filter api test:int -- cancel outcome two-tabs` (20× o
`two-tabs`), `pnpm --filter api test:e2e -- appointments-actions routes-require-session`,
`pnpm typecheck`, `pnpm lint`, `git status --short`. Revisor: `fable`.
Commit: `feat: cancelar, concluído/falta e detalhe do agendamento`.

### Tarefa 8: RN-43 — prévia e confirmação de bloqueio com agendamentos afetados

Receitas: guia §3.1, §3.4, §3.11; arquitetura §2.8 (passos 1–6 da RN-43), §5. Critérios:
**CA-2.11** (I + E; dona da API), **CA-2.12** (I + E, dona), **CA-2.13** (I + E, dona),
**CA-2.17** (I + E, dona). RN-42, RN-43, RN-44.

> Spec RN-43: afetados = ocupantes futuros (`PENDING`/`CONFIRMED`, `startAt > agora`) que
> intersectam o bloqueio; padrão cancelar todos, ela marca os que mantém. Confirmando: cria
> o bloqueio; os não mantidos viram `CANCELLED` (`cancelledBy = DENTIST`,
> `cancelReason = BLOCK`); os mantidos ficam intactos. A confirmação envia `affectedIds` e
> `keepIds ⊆ affectedIds`; a API recalcula; diferente → 409 com a lista atualizada e nada
> muda. Em andamento e passados não são afetados. RN-44: apagar o bloqueio não ressuscita
> nada.

**Arquivos:**
- Modificar: `apps/api/src/scheduling/application/schedule-config.service.ts` (injeta `CLOCK`,
  `AppointmentRepository`, `EventEmitter2`), `apps/api/src/scheduling/http/dentist/blocks.controller.ts`,
  `apps/api/src/scheduling/http/dto/create-block.dto.ts`, `shared-types/scheduling.ts`,
  `routes-require-session.e2e-spec.ts` (`POST /blocks/preview`).
- Criar: `apps/api/test/integration/scheduling/block-impact.int-spec.ts`,
  `apps/api/test/e2e/scheduling/blocks-rn43.e2e-spec.ts`.
- Não editar os testes `[CA-1.15]` existentes: `affectedIds`/`keepIds` são opcionais
  (padrão `[]`), então um `POST /blocks` sem prévia sobre um período vazio continua 201.

**Contratos:**

```ts
// shared-types/scheduling.ts
export interface AffectedAppointmentDto { id: string; startAt: string; endAt: string;
  patientName: string; procedureName: string | null; status: 'PENDING' | 'CONFIRMED'; hasEmail: boolean }
export interface BlockPreviewResponse { startAt: string; endAt: string; affected: AffectedAppointmentDto[] }
export type ConfirmBlockRequest = CreateBlockRequest & { affectedIds?: string[]; keepIds?: string[] };

// schedule-config.service.ts
previewBlock(professionalId, req: CreateBlockRequest): Promise<BlockPreviewResponse>;   // sem escrita, sem lock
createBlock(professionalId, req: ConfirmBlockRequest): Promise<BlockRecord>;
//  $transaction: 1 lockSchedule → 2 affected = affectedByBlock(range, findOccupyingIn(tx, …), now)
//  → 3 validateKeepIds(affected, req.affectedIds ?? [], req.keepIds ?? []):
//       KEEP_NOT_SUBSET → DomainError('INVALID_KEEP_IDS'); STALE → DomainError('BLOCK_AFFECTED_CHANGED', { affected: AffectedAppointmentDto[] })
//  → 4 insertBlock → 5 para cada id em affected \ keep: transition({ from: ['PENDING','CONFIRMED'],
//       startAt: { gt: now }, + intersecção com o bloqueio no WHERE (startAt < block.end, endAt > block.start),
//       data: { status: CANCELLED, cancelledBy: DENTIST, cancelReason: BLOCK, cancelledAt: now, closedAt: now },
//       event: { type: CANCELLED, actor: DENTIST, toStatus: CANCELLED } });
//     ok: false (remarcado/cancelado em paralelo — essas ações não pegam o lock) → lança
//       BLOCK_AFFECTED_CHANGED com a lista recalculada (rollback de tudo)
//  → 6 depois do commit: emitAsync(Cancelled, { reason: 'BLOCK', previousStatus, notifyPatient: !!contactEmail, actor: 'DENTIST' }) por cancelado
// deleteBlock: inalterado (RN-44 — não toca agendamentos).
```

- `transition` da Tarefa 3 ganha o filtro opcional `intersects?: { start: Date; end: Date }`
  (ou o caso de uso passa `endAt`/`startAt` no `where`): decidir no esqueleto, sem duplicar
  a regra.
- DTO: `affectedIds`/`keepIds` `@IsOptional @IsArray @ArrayMaxSize(200) @IsUUID('4', { each: true })`.
- Rotas: `POST /blocks/preview` (200, `BlockPreviewResponse`), `POST /blocks` (201,
  `BlockDto`, inalterado).
- `patientName` em `affected`/`details.affected` é `contactName` (painel autenticado; mesma
  exceção do `APPOINTMENT_OVERLAP`). O motivo do bloqueio nunca vai para log.

**Testes de aceite (testador):**
- `block-impact.int-spec.ts` (now = seg 09/11 08:00; `CONFIRMED` A 13:30, B 14:30, C 15:30
  na ter 10/11, 30 min cada; bloqueio `PERIOD` ter 13:30–16:30):
  - `describe('[RN-43] bloqueio sobre agendamentos')`, `[CA-2.11]`: `previewBlock` →
    `affected` = `[A, B, C]` (por horário) e **nenhuma** escrita (`scheduleBlock.count()` e
    status inalterados — "fechar a prévia sem confirmar, nada muda"). `createBlock` com
    `affectedIds [A,B,C]`, `keepIds []` → os três `CANCELLED`, `cancelReason BLOCK`,
    `cancelledBy DENTIST`, `closedAt = now`; 3 `AppointmentEvent` `CANCELLED`; 3 eventos
    `appointment.cancelled` com `reason: 'BLOCK'`; o bloqueio existe. Cenário novo com
    `keepIds [B]` → A e C `CANCELLED`, B `CONFIRMED` intacto (`toEqual` do registro), e
    `AvailabilityService` da ter 10/11 não tem nenhum início entre 13:30 e 16:30.
  - `[CA-2.12]`: prévia com A e B; cria C no período → `createBlock({ affectedIds: [A,B] })`
    → `BLOCK_AFFECTED_CHANGED` com `details.affected` = `[A,B,C]`; `scheduleBlock.count()`
    e status de A/B/C inalterados. Variante: A cancelado antes → `details.affected = [B]`.
    `keepIds [X]` (fora de `affectedIds`) → `INVALID_KEEP_IDS`, nada muda.
  - `describe('[RN-44] …')`, `[CA-2.13]`: depois do `[CA-2.11]`, `deleteBlock` → A, B, C
    continuam `CANCELLED`, nenhum `AppointmentEvent` novo.
  - `[CA-2.17]`: now = ter 10/11 14:10; `CONFIRMED` 14:00–15:00 e 15:00–15:30; bloqueio
    13:30–16:30 → prévia só com o de 15:00; confirmar com `affectedIds [15:00]` → o de
    14:00 continua `CONFIRMED`, o de 15:00 `CANCELLED`.
  - Foco item 5 (meia-noite com encaixe em andamento) e item 7 (ordem/duplicata; vazio
    cria direto).
  - Corrida: `createBlock` × `reschedule` de B para fora do período, em `Promise.allSettled`
    → ou o bloqueio cancela B (e a remarcação dá `INVALID_STATE`), ou a remarcação vence e o
    bloqueio responde `BLOCK_AFFECTED_CHANGED` sem criar nada. Nunca B `CANCELLED` fora do
    bloqueio. 20×.
- `blocks-rn43.e2e-spec.ts`: `[CA-2.11]` `POST /blocks/preview` 200 com `affected`
  (`patientName`, `hasEmail`), `POST /blocks` 201; `[CA-2.12]` 409
  `BLOCK_AFFECTED_CHANGED` com `details.affected` e 422 `INVALID_KEEP_IDS`; `[CA-2.13]`
  `DELETE /blocks/:id` 204 e `GET /appointments/:id` de A ainda `CANCELLED`;
  `[CA-2.17]` 200/201 com o "agora" fixado em 14:10.

**Verificação:** `pnpm --filter api test:int -- block-impact blocks advisory-lock` (20× a
corrida), `pnpm --filter api test:e2e -- blocks routes-require-session` (inclui os
`[CA-1.15]` da fatia 1, intocados), `pnpm typecheck`, `pnpm lint`, `git status --short`.
Revisor: `fable`.
Commit: `feat: bloqueio pergunta o que fazer com agendamentos afetados (RN-43)`.

---

### Tarefa 9: Agenda semanal completa e varredura final de rotas

Receitas: guia §3.8; arquitetura §3.5, §5. Critérios: **CA-2.15** (W + P, dono). CA-1.22
(regressão: lista completa). RN-34, RN-45, RN-46.

> Spec CA-2.15: a visão semanal mostra agendamentos com nome, horário, procedimento e
> status (pendente visualmente distinto), bloqueios, feriados, desbloqueios e as faixas de
> atendimento, tudo no fuso da clínica.

**Arquivos:**
- Ler antes: `apps/web/AGENTS.md`; `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`,
  `06-fetching-data.md`; os testes existentes `week-view.test.tsx`, `week-layout*.test.ts`,
  `e2e/fatia-1/agenda.spec.ts` (o que já está coberto pela fatia 1 **não** é refeito).
- Modificar: `apps/web/src/components/calendar/{week-view.tsx,week-layout.ts}` só no que
  faltar (VERIFICAR: status textual + estilo de `PENDING`, nome do procedimento,
  desbloqueio marcado); `apps/api/test/e2e/security/routes-require-session.e2e-spec.ts`
  (conferência final).
- Criar: `apps/web/e2e/fatia-2/agenda.spec.ts`; teste Vitest
  `apps/web/src/components/calendar/week-view.status.test.tsx`.

**Contratos:** nenhum novo na API (`GET /calendar` da fatia 1 já devolve `status`,
`contactName`, `procedureName`, `onHoliday`, `outsideWorkingHours`, bloqueios, feriados
com `overridden` e faixas). Se faltar algo para a `WeekView`, **parar e reportar** antes de
mudar o contrato. A `WeekView` continua Server Component; a área clicável (Tarefa 10) é um
Client Component filho.

**Testes de aceite (testador):**
- `week-view.status.test.tsx`, `describe('[RN-13] [RN-30] visão semanal')`, `[CA-2.15]`:
  `CONFIRMED` e `PENDING` lado a lado → o `PENDING` tem rótulo textual "Pendente" (não só
  cor) e classe/atributo distinto (`data-status="PENDING"`); cada bloco mostra nome,
  `HH:mm–HH:mm` no fuso da clínica e procedimento ("Sem procedimento" quando nulo).
- `e2e/fatia-2/agenda.spec.ts`, `[CA-2.15]`: com `e2e/support/db.ts` inserir na semana de
  16/11 (sex 20/11 = Consciência Negra): um `CONFIRMED` seg 16/11 10:00 "Maria" com
  procedimento, um `PENDING` ter 17/11 09:00, um bloqueio qua 18/11 13:30–15:00; abrir
  `/dashboard/agenda?semana=2026-11-16` (parâmetro lido por `src/lib/week-param.ts`) →
  20/11 marcado como feriado; inserir o desbloqueio de 20/11 e recarregar → 20/11
  marcado como "desbloqueado" e com as faixas de sexta;
  cada elemento com `boundingBox()` não nulo e dentro da coluna do dia certo; o topo do
  bloco de 10:00 alinhado à linha de 10:00 (tolerância de 2 px); faixas da segunda
  (08:00–11:00, 13:30–17:00) visíveis. Reusar `storageState` (throttle de login 5/min).
- `routes-require-session.e2e-spec.ts` (regressão CA-1.22): a lista contém as 11 rotas
  novas (`POST /blocks/preview`, busca de paciente, `POST /appointments/preview`,
  `POST /appointments`, `PATCH /appointments/:id/schedule`, `PATCH /appointments/:id/contact`,
  `POST /appointments/:id/cancel`, `POST /appointments/:id/complete`,
  `POST /appointments/:id/no-show`, `GET /appointments/:id`) e **nenhuma** rota `@Public()`
  nova (a lista pública continua a da fatia 1).

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e` (roda tudo — não
filtra; nenhum outro agente com Playwright/int/e2e ao mesmo tempo),
`pnpm --filter api test:e2e -- routes-require-session`, `pnpm typecheck`, `pnpm lint`.
Commit: `feat: agenda semanal completa no painel`.

### Tarefa 10: Web — diálogo de marcação direta

Receitas: guia §3.8; arquitetura §3.5 (edição por formulário primeiro). Ler antes
`apps/web/AGENTS.md` e os docs do Next 16 citados na receita. Critérios: **CA-2.5** (W + P,
dono: "a tela mostrou o aviso correspondente antes de salvar"), **CA-2.1**, **CA-2.2**,
**CA-2.3**, **CA-2.16** (camada W/P de apoio; donos na Tarefa 4). RN-30, RN-33, RN-34,
RN-37.

> Spec RN-37: em marcação direta, remarcação e cancelamento, "avisar paciente por e-mail"
> marcado por padrão, **só aparece se houver e-mail**; ela pode desmarcar. RN-34: a tela avisa
> ("fora do horário de atendimento", "dia de feriado", "dentro do bloqueio X") mas permite.
> RN-17: o front gera uma `idempotencyKey` (UUID) por tentativa de envio.

**Arquivos:**
- Criar: `apps/web/src/components/appointments/{appointment-dialog,appointment-form,patient-lookup-field,slot-warnings,conflict-list}.tsx`
  (+ `.test.tsx` de cada um com lógica), `apps/web/src/components/calendar/week-slot-picker.tsx`
  (`'use client'`: área clicável sobre a grade que abre o diálogo com data/hora do clique,
  arredondada para 15 min), `apps/web/e2e/fatia-2/marcacao.spec.ts`.
- Modificar: `apps/web/src/app/dashboard/agenda/page.tsx` (busca `GET /procedures` para a
  lista de ativos; botão "Novo agendamento"), `week-view.tsx` (encaixa o slot picker sem
  virar Client Component), `packages/shared-types/src/schemas.ts` (Zod de
  `CreateAppointmentRequest`, só feedback).
- `pnpm dlx shadcn@4.19.0 add checkbox textarea` se ainda não existirem (versão exata).

**Contratos (comportamento da tela):**
- Campos: data, hora (passos de 15 min), procedimento (só ativos; "Sem procedimento"),
  duração (pré-preenchida pelo procedimento; sem procedimento, 30; passos de 15; ≤ 480),
  telefone, nome, e-mail, observação, "Avisar paciente por e-mail" (visível só com e-mail;
  marcado por padrão).
- Telefone: ao sair do campo, busca de paciente (rota: Decisão 5). Achou → preenche
  nome e e-mail **só se estiverem vazios** e mostra "Paciente já cadastrado: {nome}". Não achou
  → nada.
- Prévia: a cada mudança de data/hora/duração (debounce ~300 ms) chama
  `POST /appointments/preview`; mostra os avisos em pt-BR ("Fora do horário de atendimento",
  "Dia de feriado: {nome}", "Dentro do bloqueio das {HH:mm} às {HH:mm}{ — motivo}") e os
  conflitos ("Conflita com {nome}, {HH:mm}–{HH:mm}"). Com conflito, "Salvar" desabilitado.
  Aviso não bloqueia.
- `idempotencyKey = crypto.randomUUID()` gerada ao abrir e **regerada a cada alteração de
  campo**; repetir o envio sem mudar nada usa a mesma chave. "Salvar" desabilitado enquanto a
  requisição está em voo.
- Sucesso → fecha e `router.refresh()`. Erro → `messageFor(code)`; 409
  `APPOINTMENT_OVERLAP` → `conflict-list` com `details.conflicts`.
- Datas e horas só via `src/lib/clinic-time.ts` (`clinicLocalToIso`, `formatClinicTime`).

**Testes de aceite (testador):**
- Vitest (`apiFetch` mockado), `describe('[RN-34] encaixe na tela')`, `[CA-2.5]`: prévia
  devolvendo cada `kind` → o texto correspondente aparece **antes** de clicar em "Salvar" e
  o botão está habilitado; ao salvar, o `POST /appointments` sai.
- `[CA-2.3]` (W): resposta 409 com `conflicts` → "Conflita com Ana, 09:00–10:00" visível;
  diálogo continua aberto.
- `[CA-2.16]` (W): dois cliques rápidos em "Salvar" → no máximo dois `POST` e, se dois, com
  a **mesma** `idempotencyKey`; mudar um campo depois de um erro → chave nova.
- `[CA-2.2]` (W): blur no telefone com lookup retornando paciente → nome/e-mail
  preenchidos.
- RN-37 (sem tag): checkbox ausente sem e-mail; presente e marcado ao digitar e-mail;
  desmarcado → `notifyPatient: false` no corpo.
- `e2e/fatia-2/marcacao.spec.ts` (Playwright, semana futura fixa via `?semana=`):
  - `[CA-2.1]` clicar na segunda 10:00, preencher "Maria", `(11) 98888-7777`, procedimento
    de 30 min, salvar → bloco "Maria" com `boundingBox()` não nulo na coluna de segunda,
    alinhado a 10:00.
  - `[CA-2.5]` sábado 10:00 → texto "Fora do horário de atendimento" visível antes de
    salvar; salvar → bloco aparece no sábado.
  - VERIFICAR como o Playwright da fatia 1 lida com "agora" (a API do e2e web roda com
    relógio real?): escolher semanas futuras relativas ao dia do teste, nunca datas fixas
    que virem passado.

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e` (sozinho no banco),
`pnpm --filter web lint`, `pnpm typecheck`, `pnpm --filter web build`.
Commit: `feat: diálogo de marcação direta na agenda`.

---

### Tarefa 11: Web — detalhe, remarcar, cancelar, contato, concluído/falta

Receitas: guia §3.8. Critérios: **CA-2.10** (W, "antes do início a ação não está
disponível"), **CA-2.14** (W: 409 mostra o estado atual e atualiza), **CA-2.6** (P, ver
**Decisão 7:** só formulário, sem arrastar), **CA-2.9**, **CA-2.18–2.21** (W de apoio). RN-15,
RN-31, RN-32, RN-36, RN-37, RN-38.

**Arquivos:**
- Criar: `apps/web/src/components/appointments/{appointment-detail,reschedule-form,cancel-dialog,contact-form,outcome-actions}.tsx`
  (+ `.test.tsx`), `apps/web/e2e/fatia-2/acoes.spec.ts`.
- Modificar: `week-view.tsx` (clicar num agendamento abre o detalhe; o bloco continua
  renderizado no servidor, o clique é um Client Component pequeno),
  `appointment-dialog.tsx` (reuso do formulário/prévia na remarcação, com
  `excludeAppointmentId`).

**Contratos (comportamento da tela):**
- Detalhe: `apiFetch('/appointments/:id')`; mostra nome, telefone (só leitura), e-mail,
  procedimento, horário, status, observação; selo "Dados diferentes do cadastro" quando
  `patientDiffers.name || patientDiffers.email` (RN-15; a ação de atualizar o cadastro é
  da fatia 3).
- Botões **apenas** de `allowedActions` (nenhum cálculo de tempo no navegador).
- Remarcar: mesmo formulário de data/hora/duração/procedimento + prévia com
  `excludeAppointmentId`; "Avisar paciente" só se houver `contactEmail` (marcado).
- Cancelar: diálogo de confirmação com "Avisar paciente" (só com e-mail; marcado).
- Contato: nome, e-mail, observação; telefone exibido como texto, não é campo; e-mail vazio =
  remover (envia `null`); aviso "O paciente passa a receber o link de cancelamento nos
  próximos e-mails" ao incluir e-mail (sem envio agora — CA-2.19).
- Concluído / Faltou: um clique cada, com confirmação.
- Qualquer 409 `INVALID_STATE` → mensagem do `api-errors` + `router.refresh()` + recarrega
  o detalhe (mostra o estado atual).

**Testes de aceite (testador):**
- Vitest `appointment-detail.test.tsx`, `describe('[RN-36] …')`, `[CA-2.10]`:
  `allowedActions: ['RESCHEDULE','CANCEL','EDIT_CONTACT']` → sem botões "Concluído"/"Faltou";
  `['COMPLETE','NO_SHOW']` → só eles; `[]` → nenhum botão de ação.
- `[CA-2.14]` (W): cancelar respondendo 409 `INVALID_STATE` com
  `details.currentStatus = 'CANCELLED'` → mensagem "Esse agendamento mudou…" e o detalhe
  recarregado mostra "Cancelado".
- `[CA-2.21]` (W): o formulário de contato não tem campo de telefone (nenhum `input` com
  nome `phone`).
- RN-37 (sem tag): checkbox de aviso ausente sem `contactEmail` em remarcar e cancelar.
- `e2e/fatia-2/acoes.spec.ts`: `[CA-2.6]` remarcar 09:00 → 15:00 pelo formulário → bloco
  na linha de 15:00 (`boundingBox`); `[CA-2.9]` cancelar → o bloco some da semana;
  `[CA-2.18]` editar observação → valor novo no detalhe. Arrastar fica
  fora da fatia (Decisão 7); o `[CA-2.6]` da tela é o do formulário.

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e` (sozinho no banco),
`pnpm --filter web lint`, `pnpm typecheck`, `pnpm --filter web build`.
Commit: `feat: detalhe e ações do agendamento na agenda`.

---

### Tarefa 12: Web — prévia de bloqueio com "manter"

Receitas: guia §3.8. Critérios: **CA-2.11** (W + P de apoio — "Se ela fechar a prévia sem
confirmar, nada muda" na tela; dono: Tarefa 8), **CA-2.12** (W de apoio). RN-43.

**Arquivos:**
- Criar: `apps/web/src/components/schedule/block-preview-dialog.tsx` (+ `.test.tsx`),
  `apps/web/e2e/fatia-2/bloqueio-rn43.spec.ts`.
- Modificar: `apps/web/src/components/schedule/block-form.tsx` (envio passa a ser prévia →
  confirmação). Os testes Vitest da fatia 1 do `block-form` que esperam `POST /blocks` direto
  mudam de comportamento: o **testador** os ajusta (prévia vazia → `POST /blocks` com
  `affectedIds: []`, `keepIds: []`), com aprovação explícita do orquestrador registrada no
  relatório — nunca o implementador.

**Contratos (comportamento da tela):**
- "Criar bloqueio" → `POST /blocks/preview`. `affected` vazio → `POST /blocks` com
  `affectedIds: []`, `keepIds: []` direto. Não vazio → diálogo "Este bloqueio atinge N
  agendamento(s)" com uma linha por afetado (data, `HH:mm–HH:mm`, nome, procedimento,
  "pendente" quando for, "será avisado por e-mail" quando `hasEmail`) e um checkbox
  **"Manter"** desmarcado (padrão: cancelar todos).
- "Confirmar" → `POST /blocks` com `affectedIds` = ids exibidos e `keepIds` = marcados.
- 409 `BLOCK_AFFECTED_CHANGED` → troca a lista por `details.affected`, preserva a marcação
  "Manter" dos ids que continuam, mostra a mensagem e **não** fecha.
- "Fechar"/Esc → nenhuma requisição além da prévia.

**Testes de aceite (testador):**
- Vitest `block-preview-dialog.test.tsx`, `describe('[RN-43] …')`:
  - `[CA-2.11]`: três afetados → três checkboxes "Manter" desmarcados; confirmar sem mexer →
    corpo com `affectedIds [A,B,C]`, `keepIds []`; marcar B → `keepIds [B]`; fechar → nenhum
    `POST /blocks`.
  - `[CA-2.12]`: confirmação respondendo 409 com `details.affected [A,B,C]` → a lista passa a
    ter C, a mensagem aparece, o diálogo continua aberto; marcação de B preservada.
- `e2e/fatia-2/bloqueio-rn43.spec.ts`, `[CA-2.11]`: três `CONFIRMED` na terça à tarde de uma
  semana futura (via `e2e/support/db.ts`), criar bloqueio 13:30–16:30 pela tela de
  bloqueios, marcar B "Manter", confirmar → na agenda só B aparece na terça à tarde
  (`boundingBox` não nulo para B, `toHaveCount(0)` para A e C); repetir abrindo a prévia e
  fechando → nada muda.

**Verificação:** `pnpm --filter web test`, `pnpm --filter web test:e2e` (sozinho no banco),
`pnpm --filter web lint`, `pnpm typecheck`, `pnpm --filter web build`.
Commit: `feat: prévia de bloqueio com escolha de quem manter`.

### Tarefa 13: Fechamento da fatia (orquestrador + testador)

Receitas: guia §4.3 (rastreabilidade), §4.6 (20×), §4.8 (regressão), §5.2 (DoD da fatia),
§6 "Fatia 2" (checklist). Sem código de feature: só testes faltantes, docs e evidência.

**Passos:**
- [ ] **Rastreabilidade** (guia §4.3, comando `comm -23` colado com a saída): a lista só pode
      conter `CA-2.4` (removido) e os CA das fatias 3 e 4. Qualquer `CA-1.x` ou `CA-2.x`
      (exceto 2.4) na saída → volta para a tarefa dona.
- [ ] **Regressão completa** (guia §4.8), os 8 comandos, na ordem, com a saída colada;
      `git status --short` limpo depois do lint. Sem nenhum outro agente usando o banco.
- [ ] **Corridas 20×** (guia §4.6), saída colada: `appointment-repository` (Tarefa 3),
      `[CA-2.16]` (Tarefa 4), remarcação concorrente (Tarefa 5), `two-tabs` (Tarefa 7),
      `block-impact` corrida (Tarefa 8), `advisory-lock` (fatia 1).
- [ ] **Checklist de segurança** guia §6 "Fatia 2", item a item, com a evidência (arquivo:linha
      ou teste) de cada um; mais: `rg "dangerouslySetInnerHTML|\\$queryRawUnsafe|\\$executeRawUnsafe|'use server'" apps`
      vazio; `rg "logger\\.(log|warn|error)" apps/api/src/scheduling` sem
      `contactName|phone|email|notes|reason|cancellationToken`; payloads de
      `appointment-events.ts` sem campo pessoal; lista pública de rotas inalterada (CA-1.22).
- [ ] **Revisão final** do diff da fatia (`superpowers:requesting-code-review`, modelo
      `fable`), com os 7 itens do Foco da revisão conferidos um a um.
- [ ] **Passeio manual** com seed limpo (`pnpm --filter api exec prisma migrate reset`),
      seguindo "O que a cliente usa no fim" (spec §8 fatia 2): marcar Maria por telefone novo;
      marcar de novo com o mesmo número em outro formato (mesmo paciente); encaixe no
      sábado (aviso); conflito (409 com nome); mover e esticar; editar contato incluindo
      e-mail; cancelar; bloqueio sobre três marcados mantendo um; apagar o bloqueio;
      concluído/falta num agendamento já iniciado (criado via banco). Prints ou notas no
      relatório. O orquestrador **pede ao usuário** que suba os servidores para o passeio
      (este plano não sobe processos).
- [ ] **Docs** no mesmo trabalho: arquitetura §5 (rota de busca de paciente conforme a
      Decisão 5: `POST /patients/lookup`; `POST /blocks` com `affectedIds?`/`keepIds?`), §7.2 (nomes dos serviços:
      um caso de uso por classe), §2.5 (se algum `details` mudou); guia §4.3 (tabela de
      camadas da fatia 2 com as camadas efetivamente usadas); ADRs 023 e 035 com a versão
      real conferida (status continua "Proposta" até o usuário aceitar); "Índice rápido"
      do `decisions.md`. Qualquer ADR nova surgida nas tarefas (ex.: rota de busca de paciente ou texto do CA-2.6)
      registrada **antes** da tarefa seguinte, não só aqui.
- [ ] Atualizar a memória do projeto (estado atual: fatia 2 pronta para aprovação).
- [ ] O usuário aprova a fatia antes de começar a fatia 3 (CLAUDE.md §3.5).

Commit: `docs: fechamento da fatia 2` (e `test:` para algum teste faltante achado aqui).

---

## Cobertura CA → tarefa → camada

Uma tarefa **dona** por critério (onde o aceite do CA é dado); as outras camadas são apoio.
Camadas como no guia §4.1 (U unit, I integração, E e2e da API, W Vitest, P Playwright).

| CA | Dono | Camadas (tarefa) |
|---|---|---|
| 2.1 | T4 | I + E (T4); P (T10) |
| 2.2 | T4 | U (T2); I + E (T4); W (T10) |
| 2.3 | T4 | I + E (T4); W (T10) |
| 2.4 | — | removido → CA-3.26 (sem teste) |
| 2.5 | T10 | U (T2); E (T4); W + P (T10) |
| 2.6 | T5 | I + E (T5); P (T11) |
| 2.7 | T5 | I + E (T5) |
| 2.8 | T5 | U (T2); E criar (T4); I + E mover (T5) |
| 2.9 | T7 | U (T2); I + E (T7); P (T11) |
| 2.10 | T7 | U (T2); I + E (T7); W (T11) |
| 2.11 | T8 | U (T2); I + E (T8); W + P (T12) |
| 2.12 | T8 | U (T2); I + E (T8); W (T12) |
| 2.13 | T8 | I + E (T8) |
| 2.14 | T7 | I + E (T7); W (T11) |
| 2.15 | T9 | W + P (T9) |
| 2.16 | T4 | I + E (T4); W (T10) |
| 2.17 | T8 | U (T2); I + E (T8) |
| 2.18 | T6 | I + E (T6); P (T11) |
| 2.19 | T6 | U (T2); I + E (T6) |
| 2.20 | T6 | U (T2); I + E (T6) |
| 2.21 | T6 | U (T2); I + E (T6); W (T11) |

Bate com a tabela do guia §4.3 (fatia 2) e a amplia: I em 2.2, 2.3, 2.6–2.8, 2.10, 2.13,
2.14, 2.16, 2.18–2.21; W em 2.2, 2.3, 2.10–2.12, 2.14–2.16, 2.21; P em 2.1, 2.5, 2.6, 2.9,
2.11, 2.18. A Tarefa 13 atualiza a tabela do guia.

## Fora desta fatia

- **Envio de e-mail** (fatia 4): `notifyPatient` só vai no payload do evento; nenhum
  listener, nenhuma `Notification`. A parte "na fatia 4, o próximo e-mail vai para
  `maria@x.com` com o link" do CA-2.19 é testada na fatia 4.
- **"Link com T1 passa a dar 'link inválido'"** (CA-2.20): a rota pública de cancelamento é
  da fatia 3 (CA-3.20). Aqui a prova é "T1 não existe mais no banco".
- **Tudo de `PENDING`** (fatia 3): T3/T4, T13 em `PENDING` (com `APPROVAL_EXPIRED` após o
  prazo, CA-3.34), a exclusão de `PENDING` vencido na RN-43, CA-2.4 → CA-3.26, a ação
  "atualizar cadastro" da RN-15 (`PATCH /patients/:id`, CA-3.7). Nesta fatia
  `assertCanEditContact` recusa `PENDING` com `INVALID_STATE` (não existe `PENDING` ainda).
- `@nestjs/schedule` e jobs (fatia 3).
- Arrastar/redimensionar com o mouse (Decisão 7: depois; o texto do CA-2.6 passa a "move" na spec, ver Tarefa 13).
- Troca de dois horários numa operação (spec §9.2, fora da v1).
- Edição do horário semanal (`PUT /working-hours`, RN-45, baixa prioridade; não está no
  escopo da fatia 2 na spec §8).
- Design da tela de login; dívidas "antes do primeiro deploy" (`COOKIE_DOMAIN`, throttler
  `hourly`, `?next=`) — decisão do usuário.
- Qualquer rota pública nova; site público.

## Divergências encontradas

Nenhuma foi resolvida em silêncio. O orquestrador leva ao usuário e corrige o documento
perdedor no mesmo trabalho.

1. **Telefone na URL.** Arquitetura §5 define `GET /patients/lookup?phone=`; o CLAUDE.md
   §4.1 proíbe dado pessoal em URL (e o `pino-http` loga `req.url`). Proposta: `POST
   /patients/lookup { phone }` e corrigir a arquitetura §5. → **Resolvida (Decisão 5): `POST`.** A Tarefa 13 corrige a arquitetura §5.
2. **CA-2.6 "arrasta" × arquitetura §3.5 "edição por formulário primeiro; arrastar vem
   depois".** A spec (precedência 1) descreve arrastar; a arquitetura adia. A API é a mesma.
   Ou a fatia 2 ganha arrastar (subtarefa na Tarefa 11), ou o texto do CA-2.6 passa a "move"
   e a arquitetura fica como está. → **Resolvida (Decisão 7): só formulário.** A Tarefa 13 ajusta o texto do CA-2.6 na spec ("move") com a aprovação do usuário.
3. **`AppointmentEvent.type`:** spec §6.7 diz `String` com valores minúsculos
   (`rescheduled`, `contact_updated`…); o schema (fatia 1) e a arquitetura usam o enum
   `AppointmentEventType` em maiúsculas. O plano segue o schema; os testes conferem
   `RESCHEDULED`/`CONTACT_UPDATED`. Corrigir o comentário da spec §6.7 (ou registrar ADR) —
   decisão do usuário, já que a spec tem precedência. **Resolvida (2026-11-17):** spec §6.7 corrigida para o enum `AppointmentEventType` em maiúsculas.
4. **Nome do paciente em `details` de erro.** CLAUDE.md §4.1 diz "nenhum dado pessoal em …
   mensagem de erro"; a RN-33 e a arquitetura §2.5 exigem o nome no 409
   `APPOINTMENT_OVERLAP` (painel autenticado). A spec vence; o plano estende o mesmo
   tratamento a `BLOCK_AFFECTED_CHANGED.details.affected` (a arquitetura não detalha o
   formato). Sugestão: o CLAUDE.md citar essa exceção ("exceto `details` de conflito no
   painel autenticado, RN-33"). **Resolvida (2026-11-17):** exceção registrada no CLAUDE.md §4.1.
5. **Arquitetura §7.2 cita um serviço `dentist-appointments`**; o CLAUDE.md §4.2 pede um caso
   de uso por classe. O plano segue o CLAUDE.md (`direct-booking`, `reschedule-appointment`,
   …) e a Tarefa 13 corrige a §7.2.
6. **Guia §4.3, camadas da fatia 2:** o CA-2.11 tem cláusula de tela ("fechar a prévia sem
   confirmar") e o CA-2.15 é só P na tabela; o plano acrescenta W/P (ver Cobertura). Não é
   conflito de regra; a Tarefa 13 atualiza a tabela.

## Decisões do usuário (2026-11-17)

1. **Ação sem mudança** (remarcar com os mesmos valores; editar contato igual): 200 com o
   agendamento como está, sem `AppointmentEvent` e sem evento. (Tarefas 5 e 6.)
2. **Início exatamente "agora"** conta como passado (`startAt ≤ agora` → `START_IN_PAST`).
   (Tarefa 2.)
3. **Observação (`notes`) aceita quebra de linha** (`

` normalizado para `
`); recusa os
   demais caracteres de controle. Nome e e-mail recusam todos. (Tarefas 4 e 6.)
4. **Marcação direta com procedimento aceita duração diferente da dele** (passos de 15,
   ≤ 480). (Tarefa 4.)
5. **Busca de paciente por `POST /patients/lookup { phone }`**, porque o telefone é dado
   pessoal e em URL iria para log de acesso/proxy, histórico e `Referer` (CLAUDE.md §4.1).
   Corrigir a arquitetura §5. (Tarefa 4.)
6. **Critério de "dados diferentes do cadastro" (RN-15), delegado ao orquestrador, prática de
   mercado para casamento de cadastro:** nome comparado sem acento, sem diferenciar caixa e com
   espaços colapsados; e-mail comparado normalizado (`trim` + minúsculas); e-mail ausente no
   agendamento **não** é divergência; e-mail no agendamento com cadastro sem e-mail **é**.
   Função pura `patientDiffers` (Tarefa 2), usada no detalhe (Tarefa 7). Só sinal: a ação de
   atualizar o cadastro é da fatia 3.
7. **Arrastar na agenda: não nesta fatia.** Só formulário (arquitetura §3.5); o texto do
   CA-2.6 passa a "move" (Tarefa 13, com aprovação do usuário).

## Auto-revisão do plano

- **Cobertura:** todo CA-2.x (exceto 2.4) tem dono e pelo menos uma camada de API ou tela; os
  7 itens do Foco da revisão têm tarefa dona. Escopo da spec §8 conferido: semanal (T9),
  T2 com dedup e chave (T4), T9 (T5), T13 (T6), T11 e T12 (T7), RN-43 (T8), trilha de
  auditoria (T3 + cada transição), "avisar paciente" presente (T10, T11; evento sem
  listener), nenhuma rota pública nova (T9 + CA-1.22).
- **Concorrência:** lock só em T2 e RN-43; repetição da busca da chave depois do lock;
  P2002 como rede; conflitos lidos fora da tx abortada; guarda de tempo no `WHERE` com o
  `now` da aplicação; eventos após o commit com `auditEventId`. A RN-43 tolera remarcação
  ou cancelamento paralelos (que não pegam o lock) devolvendo `BLOCK_AFFECTED_CHANGED`.
  Risco residual aceito: um agendamento **remarcado para dentro** do período depois do
  cálculo de afetados fica mantido e intacto (o bloqueio só restringe o público, RN-42) —
  o revisor confirma.
- **Consistência de tipos:** `AppointmentDto`, `ConflictDto`, `SlotWarningDto`,
  `AffectedAppointmentDto`, `DentistAction` no `shared-types`; o domínio usa os mesmos
  nomes; `transition()` é a única via de mudança de status.
- **Pontos marcados VERIFICAR:** `pnpm why libphonenumber-js` (T1); o que a `WeekView` já
  mostra (T9); como o Playwright da fatia 1 lida com "agora" (T10).
- **Bloqueios para despachar:** ADRs 023/035 aceitas; Docker
  aberto; autorização de commits.
