# Decisões Arquiteturais — Sistema de Agendamento (Clínica Dra. Eloísa)

Log cronológico das decisões técnicas do projeto e o porquê de cada uma. Formato leve de
ADR (Architecture Decision Record): cada entrada tem contexto, decisão e consequências.
Atualizado ao longo do projeto — não é um documento fechado no dia 1.

**Como usar:** ao tomar uma decisão arquitetural nova (escolha de biblioteca, padrão de
comunicação entre módulos, modelagem de dado, trade-off de segurança/performance),
acrescente uma entrada aqui **antes** de seguir pra próxima tarefa do plano em
`docs/superpowers/plans/`. Decisões de processo/fluxo de trabalho (como o código é
revisado, como os planos são divididos) não entram aqui — isso é memória de sessão do
Claude, não arquitetura do sistema.

---

## 001 — Construção do zero, sem Cal.com/Calendly

**Data:** 2026-08-24 (decisão pré-existente ao início do projeto com Claude Code)
**Status:** Aceita

**Contexto:** Escopo de um único consultório odontológico, com necessidade de controle
visual total e integração com o site da clínica.

**Decisão:** Construir o sistema de agendamento do zero (NestJS + Next.js + Prisma), em
vez de integrar uma ferramenta pronta como Cal.com ou Calendly.

**Consequências:** Mais trabalho de implementação (lógica de disponibilidade, prevenção
de conflito, etc. tudo por conta própria), mas controle total de UX/marca e valor real
de portfólio técnico — a lógica de concorrência (ver ADR 007) não existiria num produto
de prateleira.

---

## 002 — Monorepo com pnpm workspaces + Turborepo

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Projeto single-tenant (um cliente só), mas com backend e frontend
separados que precisam compartilhar tipos/schemas de validação (DTOs via Zod).

**Decisão:** `apps/api` (NestJS) + `apps/web` (Next.js) + `packages/shared-types` num
único repositório, gerenciado com pnpm workspaces e Turborepo para orquestrar
build/dev/lint/test entre os pacotes.

**Consequências:** Compartilhar tipos entre front e back evita bugs de contrato de API
sem precisar publicar um pacote npm separado. Custo: setup inicial mais complexo que um
repo único simples (ver ADR 014 sobre os problemas de instalação de dependências que
isso não causou diretamente, mas que apareceram no processo).

---

## 003 — Backend: monolito modular orientado a eventos (NestJS)

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Single-tenant, manutenção solo, sem necessidade de escalar módulos
independentemente — mas com risco real de virar um "modelito" (grande bola de lama) se
os módulos chamarem uns aos outros diretamente.

**Decisão:** Monolito modular: módulos de domínio (a definir por módulo, ex.
`appointments`, `patients`, `professionals`) nunca se chamam diretamente. Comunicação
entre módulos acontece via `@nestjs/event-emitter` (ex.: `appointment.created`,
`appointment.cancelled`), não injeção direta de service de outro módulo.

**Consequências:** Adicionar um módulo de `notifications` na fase 2 (WhatsApp) é um
"encaixe" — ele escuta os eventos que já existem, sem precisar alterar `appointments`.
Custo: indireção extra pra entender o fluxo (rastrear quem escuta um evento é menos
óbvio que uma chamada de função direta) — aceito conscientemente pelo ganho de
desacoplamento.

---

## 004 — Frontend: Next.js App Router + Tailwind + shadcn/ui

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Página pública de agendamento precisa de bom SEO (a clínica precisa
aparecer no Google) e identidade visual sob medida, não "cara de template".

**Decisão:** Next.js App Router, com Server Components por padrão na página pública
(SEO) e Client Components só onde há interatividade real (calendário, formulário).
Tailwind + shadcn/ui como base de componentes, customizados visualmente.

**Consequências:** Estrutura de pastas/componentização detalhada fica em aberto até o
módulo de frontend correspondente ser brainstormed — este ADR só fixa o framework e o
princípio de Server vs. Client Components, não a árvore de componentes.

---

## 005 — `Professional` como entidade própria desde a v1

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Só existe uma profissional (a dentista) hoje, mas a clínica pode crescer
(mais profissionais/cadeiras) no futuro.

**Decisão:** `Appointment`, `WorkingHours`, `ScheduleException` e `Service` referenciam
`professionalId` via FK desde o schema inicial, mesmo com uma única linha em
`Professional` hoje.

**Consequências:** Adicionar um 2º profissional no futuro é um INSERT, não uma migração
estrutural. Custo: um join a mais nas queries mesmo com 1 profissional só — aceito.

---

## 006 — Disponibilidade como regras recorrentes + exceções, não slots pré-gerados

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Horários de atendimento, intervalo de almoço e feriados ainda não estavam
definidos (dependiam da reunião de 31/08) — o modelo de dado precisava absorver isso sem
migração grande.

**Decisão:** `WorkingHours` (dia da semana + faixa em minutos) representa o horário
recorrente; `ScheduleException` cobre uma data específica (feriado fechado ou horário
customizado). Os slots disponíveis são **calculados em tempo real** a partir dessas
regras + agendamentos existentes — não existem linhas de "slot" pré-geradas no banco.
Intervalo de almoço não é um campo especial: é modelado como duas linhas de
`WorkingHours` no mesmo dia, com a lacuna entre elas tratada como indisponível.

**Alternativa considerada:** slots pré-gerados por um job (rejeitada — mudar o horário
de atendimento exigiria regenerar/limpar slots futuros, e reserva via `UPDATE` num slot
existente é menos flexível pra durações de serviço variáveis).

**Consequências:** Mudança de horário de atendimento é só uma mudança de dado, sem job
de regeneração. Custo: lógica de cálculo de slot fica no backend (a construir no módulo
de disponibilidade).

---

## 007 — Prevenção de conflito de horário via exclusion constraint do Postgres

**Data:** 2026-08-24 (decisão), 2026-08-25 (implementada e testada sob concorrência real
via SQL direto), 2026-08-26 (testada via Prisma Client, formato de erro corrigido)
**Status:** Aceita, verificada

**Contexto:** É o núcleo técnico do projeto — duas pessoas podem tentar marcar o mesmo
horário simultaneamente, e a duração da consulta varia por serviço (então nem sempre é
uma colisão de horário exato).

**Decisão:** `EXCLUDE USING gist ("professionalId" WITH =, tstzrange("startAt","endAt")
WITH &&) WHERE (status <> 'CANCELLED')` — o banco recusa fisicamente um INSERT que
sobreponha outro do mesmo profissional, mesmo sob concorrência real. Requer extensão
`btree_gist`.

**Como o erro chega na aplicação (corrigido depois de testar de verdade):** via Prisma
Client, uma violação desta constraint é um **`PrismaClientUnknownRequestError`**, não
`PrismaClientKnownRequestError` — o Prisma só classifica constraints que reconhece
nativamente (unique, FK, not-null) com um `.code` estruturado tipo `P2002`/`P2003`; um
`EXCLUDE` cai como erro "desconhecido", sem `.code`. O código nativo do Postgres
(`23P01`) e o nome da constraint só existem dentro de `error.message` como texto. Duas
suposições anteriores neste mesmo projeto (`P2004`, depois `P2010`) estavam erradas —
corrigido só depois de rodar `prisma.appointment.create()` de verdade em concorrência e
inspecionar o erro real (`error.message`/`error.constructor.name`, nunca
`JSON.stringify(error)`, que esconde `.message` por ela não ser enumerable em `Error`).
O módulo de `appointments` (futuro) precisa checar `error.constructor.name ===
'PrismaClientUnknownRequestError'` + `error.message.includes('no_overlapping_appointments')`
pra mapear isso num 409 pro paciente — não pode confiar num `.code`.

**Alternativas consideradas:** (a) `UNIQUE(professionalId, startAt)` — rejeitada, não
pega overlap parcial com durações diferentes; (b) transação/lock em código
(`SERIALIZABLE`/`SELECT ... FOR UPDATE`) — rejeitada, garantia de integridade ficaria no
código da aplicação, não no banco, mais frágil.

**Consequências:** Prisma não expressa `EXCLUDE` no schema — a constraint vive só na
migration SQL (editada à mão), invisível ao Prisma Client. Verificado com teste real de
concorrência (duas sessões `psql` simultâneas, uma segurando transação aberta) —
confirmado que a segunda tentativa espera e depois falha com `23P01`.

---

## 008 — `Patient` como entidade própria, sem conta/login

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Paciente agenda só com nome + telefone, sem fricção de criar conta.

**Decisão:** Tabela `Patient` separada (não campos soltos em `Appointment`), com
`phone` único — permite localizar um paciente existente por telefone em vez de duplicar.

**Consequências:** Histórico de paciente (fora de escopo agora, fase 2) fica pronto sem
migração de dados depois — é só uma feature de leitura sobre o que já existe.

---

## 009 — Cancelamento do paciente via link com token único, sem autenticação

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Paciente não tem conta; cancelamento não pode depender de WhatsApp (fora
de escopo da v1).

**Decisão:** `Appointment.cancellationToken` (único), exibido na tela de confirmação do
agendamento. Link público `/cancelar/{token}` é a única porta de entrada do paciente
pra cancelar — não depende de nenhuma automação externa.

**Consequências:** Dentista continua podendo cancelar/reagendar qualquer agendamento
direto pelo painel logado, sem token.

---

## 010 — `AppointmentStatus` cobre aprovação manual e confirmação automática por regra de código

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** A reunião de 31/08 ainda vai decidir se todo agendamento precisa de
aprovação manual da dentista, ou se confirma sozinho.

**Decisão:** Enum `PENDING | CONFIRMED | CANCELLED | COMPLETED | NO_SHOW` já no schema
inicial. A decisão de qual status um agendamento novo recebe é uma regra de **código**
(branch no service de `appointments`), não uma migração de schema.

**Consequências:** Nenhuma mudança de schema necessária depois da reunião — só lógica no
módulo de `appointments` quando ele for implementado.

---

## 011 — Idempotência via `idempotencyKey` em `Appointment`

**Data:** 2026-08-24
**Status:** Aceita

**Contexto:** Requisito de segurança/UX do projeto: duplo clique ou retry de rede não
pode criar dois agendamentos.

**Decisão:** `Appointment.idempotencyKey` (único, opcional) — o front gera uma chave por
tentativa de agendamento; um retry com a mesma chave não cria um segundo registro.

**Consequências:** Lógica de verificação (buscar por `idempotencyKey` antes de criar)
fica pro módulo de `appointments`.

---

## 012 — Timestamps armazenados como `timestamptz` (UTC), não `timestamp` sem fuso

**Data:** 2026-08-25 (correção — a intenção já estava no design spec original de
2026-08-24, mas a implementação inicial divergiu)
**Status:** Aceita, corrigida

**Contexto:** Um bug clássico de sistema de agendamento é ambiguidade de fuso horário.
O design spec original já dizia "sempre UTC", mas a implementação inicial (schema sem
`@db.Timestamptz`) resultou em colunas `timestamp(3) without time zone` — o Prisma mapeia
`DateTime` pra esse tipo por padrão no Postgres, sem avisar.

**Decisão:** Todo campo `DateTime` do schema recebeu `@db.Timestamptz(3)` explícito.
Isso obrigou a exclusion constraint (ADR 007) a trocar `tsrange` por `tstzrange`
(a função certa pra colunas com fuso) — exigiu derrubar e recriar a constraint numa
migration corretiva, já que ela dependia de uma expressão sobre o tipo antigo da coluna.

**Consequências:** Descoberto por um subagent de revisão pós-implementação, não
planejado antecipadamente — fica registrado aqui como lição: **não assumir o
mapeamento padrão de tipo do Prisma sem verificar a coluna real no Postgres.**

---

## 013 — Baseline de segurança ativo desde o primeiro boot da API

**Data:** 2026-08-25
**Status:** Aceita

**Contexto:** Requisitos de segurança do projeto (obrigatórios, não opcionais): Helmet,
CORS explícito, rate limiting, validação de DTO, hash de senha, logs sem dado sensível.

**Decisão:** `apps/api/src/main.ts`/`app.module.ts` já sobem com: Helmet
(`app.use(helmet())`), CORS restrito a `CORS_ORIGIN` com checagem fail-closed (lança erro
no boot se a env var não estiver setada — nunca cai pro padrão `*`), `ValidationPipe({
whitelist: true, forbidNonWhitelisted: true })` global, `ThrottlerGuard` registrado via
`APP_GUARD` (100 req/min por padrão, rotas sensíveis apertam mais depois com
`@Throttle`), logs estruturados via `nestjs-pino` com redação de `authorization`/`cookie`,
e `argon2` instalado (uso real vem no módulo de Auth).

**Consequências:** Todo módulo futuro herda essa postura de segurança sem precisar
reconfigurar nada — só usar. Dois desses itens (`ThrottlerGuard` não estava
efetivamente registrado; CORS caía em allow-all com env var ausente) foram achados reais
de revisão pós-implementação, não pegos na primeira passada — reforça o valor da
revisão por subagent a cada tarefa.

---

## 014 — Prisma pinado em 6.19.3 (client e CLI), não 7.x/8.x

**Data:** 2026-08-25
**Status:** Aceita

**Contexto:** Instalação sem pin explícito de versão resolveu `@prisma/client@^7.10.0`
mas `prisma@8.0.0-rc.10` (release candidate) — major version diferente entre CLI e
client, e o RC trouxe pacotes completamente estranhos (`workerd`, `alchemy` — ferramental
de Cloudflare Workers). Investigando, Prisma 7 remove suporte a `datasource.url` no
`schema.prisma` (exige `prisma.config.ts` + driver adapter tipo `@prisma/adapter-pg`
passado pro `PrismaClient`) — quebra o padrão que o design spec já define, e é recente
demais pra ter documentação/tutoriais maduros.

**Decisão:** Pinar `@prisma/client` e `prisma` na mesma versão exata `6.19.3` — a última
estável da linha 6.x, que mantém `datasource { url = env("DATABASE_URL") }` funcionando
como documentado.

**Consequências:** Fica registrado como prática geral (ver memória `feedback-package-
version-pinning`): sempre pinar versão exata ao instalar dependência nova neste projeto,
e verificar compatibilidade de major version entre pacotes relacionados antes de seguir.

---

## 015 — Ambiente local: Postgres via Docker Compose, com banco de teste auto-provisionado

**Data:** 2026-08-24/25
**Status:** Aceita

**Contexto:** Precisa de um banco de desenvolvimento reproduzível (qualquer máquina,
incluindo CI futuro) sem passo manual.

**Decisão:** `docker-compose.yml` sobe Postgres 16 (pinado em `16.15`, versão exata
puxada), com `agendamento_dev` criado pela própria imagem e `agendamento_test` criado
via script em `docker-entrypoint-initdb.d` (roda sozinho na primeira inicialização do
volume).

**Consequências:** `docker compose down -v && docker compose up -d` reproduz o ambiente
completo sem nenhum passo manual — achado de revisão: a versão inicial só tinha o banco
de teste porque foi criado à mão, e se perderia num ambiente novo. Corrigido antes de
virar um problema real.

---

## Índice rápido

| # | Decisão | Área |
|---|---|---|
| 001 | Construção do zero, sem Cal.com/Calendly | Escopo |
| 002 | Monorepo pnpm + Turborepo | Infra |
| 003 | Monolito modular orientado a eventos | Backend |
| 004 | Next.js App Router + Tailwind + shadcn/ui | Frontend |
| 005 | `Professional` como entidade própria desde a v1 | Dados |
| 006 | Disponibilidade: regras recorrentes, não slots pré-gerados | Dados |
| 007 | Anti-overlap via exclusion constraint do Postgres | Dados/Concorrência |
| 008 | `Patient` como entidade própria, sem login | Dados |
| 009 | Cancelamento do paciente via token, sem auth | Dados/Segurança |
| 010 | `AppointmentStatus` flexível por regra de código | Dados |
| 011 | Idempotência via `idempotencyKey` | Dados/Segurança |
| 012 | Timestamps em `timestamptz` (UTC) | Dados |
| 013 | Baseline de segurança desde o boot | Backend/Segurança |
| 014 | Prisma pinado em 6.19.3 | Infra |
| 015 | Postgres local via Docker Compose | Infra |
