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
**Status:** Aceita — ajustada pela ADR 030 (DTOs da API com class-validator; Zod só no web)

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
**Status:** Aceita — refinada pela ADR 028 (porta de leitura `AppointmentReader`)

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
**Status:** Aceita — ajustada pela ADR 020 (`ScheduleBlock` no lugar de `ScheduleException`)

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
**Status:** Aceita — ajustada pela ADR 020

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
**Status:** Aceita, verificada — ajustada pela ADR 020

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
**Status:** Aceita — ajustada pela ADR 020

**Contexto:** Paciente agenda só com nome + telefone, sem fricção de criar conta.

**Decisão:** Tabela `Patient` separada (não campos soltos em `Appointment`), com
`phone` único — permite localizar um paciente existente por telefone em vez de duplicar.

**Consequências:** Histórico de paciente (fora de escopo agora, fase 2) fica pronto sem
migração de dados depois — é só uma feature de leitura sobre o que já existe.

---

## 009 — Cancelamento do paciente via link com token único, sem autenticação

**Data:** 2026-08-24
**Status:** Aceita — ajustada pela ADR 020

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
**Status:** Aceita — ajustada pela ADR 020

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
**Status:** Aceita — refinada pela ADR 026

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

## 016 — `apps/web` na versão mais recente do Next.js (16.x), não fixada num major anterior

**Data:** 2026-08-26
**Status:** Aceita

**Contexto:** `create-next-app@latest` resolveu Next.js 16.3.3 + React 19.2.8 + Tailwind
4.3.3 — diferente do Prisma (ADR 014), aqui não havia motivo prático pra fixar numa
versão anterior (sem mismatch de major entre pacotes, sem feature quebrando um padrão
já documentado no design spec).

**Decisão:** Manter a versão mais recente resolvida pelo `create-next-app`, mesmo
sabendo que o Next 16 tem mudanças reais de breaking change em relação a versões
anteriores (o próprio framework gera um `apps/web/AGENTS.md` avisando disso pra
qualquer IA/assistente).

**Consequências:** Qualquer código de frontend real (módulos futuros) precisa consultar
`apps/web/node_modules/next/dist/docs/` antes de assumir padrões de versões anteriores
do Next.js — documentado como referência de memória, não só aqui. O Turbopack é o
bundler padrão do `next dev` nessa versão (era opt-in antes) — `--webpack` reverte se
necessário. Um crash do Turbopack processando `globals.css` (erro de DLL do Windows,
`0xc0000142`, processo filho do Node morrendo ao spawnar) aconteceu **duas vezes
seguidas** na primeira sessão (confirmado pelos timestamps de dois `next-panic-*.log` em
`%TEMP%`, 68s de diferença) antes de funcionar — não uma vez só, como o commit original
registrou. Revisão de qualidade tentou reproduzir de novo depois (2 tentativas frescas,
cada uma com limite de tempo) e ambas funcionaram limpo. Causa provável: algo
Windows-específico no jeito que o Turbopack spawna um processo nativo pro worker de
PostCSS (suspeita: antivírus/EDR interceptando um `node.exe` recém-criado) — não
totalmente explicado, mas não bloqueia o módulo. **Se voltar a acontecer de forma
consistente num módulo futuro, não assumir "transitório" de novo — investigar a fundo.**

---

## 017 — Correções técnicas na spec do módulo Auth: `@nestjs/jwt` (dependência, versão) e hash do refresh token

**Data:** 2026-09-04
**Status:** Aceita

**Contexto:** A spec de design do módulo Auth
(`docs/superpowers/specs/2026-09-04-auth-module-design.md`) continha duas imprecisões encontradas ao detalhar
o plano de implementação: (1) afirmava que `@nestjs/jwt` já estava instalado junto com `argon2` e
`@nestjs/throttler` — não estava; (2) propunha reaproveitar `argon2` para hashear o refresh token armazenado em
`RefreshToken.tokenHash`, mas argon2 é intencionalmente não-determinístico (salt aleatório por chamada), o que
torna impossível localizar o registro certo por igualdade no banco a partir do valor recebido do cliente. Uma
terceira imprecisão surgiu já na execução da Tarefa 1, não prevista pela spec nem pelo plano: `pnpm add
@nestjs/jwt` resolveu `@nestjs/jwt@^12.0.1` — sua `peerDependencies` aceita `@nestjs/common@^11.0.0` (não é o
mismatch de major que o plano já mandava checar), mas a versão 12.x é publicada como ESM puro
(`"type": "module"`, sem build CJS), enquanto `apps/api` compila/roda como CommonJS (`ts-jest`, sem `"type":
"module"`). Confirmado concretamente: um teste descartável importando `JwtModule`/`JwtService` falhou com
`SyntaxError: Cannot use import statement outside a module` em `@nestjs/jwt/dist/index.js:1`.

**Decisão:** `@nestjs/jwt` entra como dependência nova do módulo, mas pinada em `11.0.2` (não a versão mais
recente resolvida automaticamente) — confirmado via `npm view` que não tem `"type": "module"` (logo é CJS) e
que sua `peerDependencies` ainda cobre `@nestjs/common@^11.0.0`. Reconfirmado com o mesmo teste descartável
passando contra `11.0.2`. `RefreshToken.tokenHash` usa SHA-256 (determinístico) em vez de argon2 — apropriado
aqui porque o valor de entrada já é um segredo de alta entropia gerado por `crypto.randomBytes(32)`, não uma
senha adivinhável por força bruta (o cenário que justifica o custo do argon2, mantido para
`User.passwordHash`).

**Consequências:** Nenhuma migração adicional necessária além da já prevista para a tabela `RefreshToken`.
Fica registrado como lembrete geral: specs de design descrevem a intenção arquitetural, não substituem a
checagem de dependências/algoritmos feita ao detalhar o plano de implementação — e essa checagem precisa
cobrir formato de módulo (ESM vs. CJS), não só compatibilidade de major version, porque um pacote pode ter
major compatível e ainda assim quebrar em runtime por publicar só ESM. O `package.json` usa `"@nestjs/jwt":
"^11.0.2"` (mesmo estilo de range dos outros `@nestjs/*` do arquivo) — um `pnpm update` futuro sem pin exato
poderia re-resolver para a linha 12.x ESM-only; vale checar isso deliberadamente antes de atualizar essa
dependência específica.

---

## 018 — Três trade-offs de segurança/deploy do módulo Auth aceitos sem mudança de código

**Data:** 2026-09-07
**Status:** Aceita — ajustada pela ADR 020

**Contexto:** Revisão final de todo o branch `auth-module-sdd` (pós Tarefas 1-8, todas já
revisadas individualmente) encontrou três decisões de segurança/topologia de deploy que
já estavam implicitamente no código, mas nunca tinham sido registradas como decisão
consciente — risco de serem lidas como omissão em vez de trade-off aceito.

**Decisão 1 — Logout não revoga o access token.** `AuthService.logout` revoga só o
refresh token (`RefreshToken.revokedAt`); o JWT de access token continua válido até seu
próprio TTL de 15min expirar, mesmo depois do logout, porque é stateless (sem
verificação contra o banco a cada request — essa é a vantagem de performance de um JWT
stateless). Aceito para a v1: usuária única de baixo risco (a própria dentista, sem
múltiplos funcionários, sem terminal compartilhado/público). Se o modelo de ameaça
mudar (múltiplas contas de staff, terminal compartilhado na recepção), revisitar com uma
deny-list de access tokens revogados (ex. Redis com TTL = TTL restante do JWT).

**Decisão 2 — `sameSite: 'lax'` restringe a topologia de deploy em produção.**
Funciona hoje porque `localhost:3000` (web) e `localhost:3001` (api) são o mesmo site
(porta não afeta "site" pra fins de cookie). Em produção, API e web precisam continuar
no mesmo domínio registrável (ex. `app.clinica.com` + `api.clinica.com` — ainda mesmo
site) pra sessão funcionar. Uma topologia genuinamente cross-site (domínios registráveis
diferentes) quebraria silenciosamente toda requisição autenticada, porque cookies `Lax`
não são enviados em fetch cross-site não-navegacional (exatamente o caso de
`apiFetch()`/Route Handlers chamando a API). Se um deploy futuro exigir domínios
diferentes, isso precisa de `sameSite: 'none'` + `secure: true` + proteção CSRF — não é
um ajuste cosmético de flag de cookie, é uma mudança de superfície de ataque.

**Decisão 3 — `trust proxy` assume exatamente um hop de reverse proxy.**
`apps/api/src/main.ts` chama `app.set('trust proxy', 1)` (onde `app` é tipado como
`NestExpressApplication`) pra que `@nestjs/throttler` (rate limit de login) identifique o IP real do
cliente por trás de um reverse proxy/load balancer de PaaS, em vez de tratar todo
tráfego como vindo de um único IP (o do proxy) — o que tornaria o limite de 5 req/min
um cadeado global em vez de por cliente. `1` cobre a topologia típica de um hop só.
Revisitar a contagem se a topologia de deploy mudar (ex. Cloudflare na frente de um
load balancer de PaaS = 2 hops; API exposta direto pra internet sem proxy nenhum = 0
hops) — um valor errado na direção errada (confiar num hop que não é proxy de verdade)
deixa um cliente malicioso forjar seu próprio IP via `X-Forwarded-For` e furar o rate
limit por completo.

**Consequências:** Nenhuma mudança de schema ou comportamento — as três já eram o
comportamento real do sistema. Ficam documentadas aqui como decisões conscientes (não
omissões) a revisitar nos gatilhos específicos listados acima, não em qualquer revisão
futura genérica.

---

## 019 — Regras de agenda confirmadas com a cliente (reunião de 28/10/2026)

**Data:** 2026-10-28
**Status:** Aceita — refinada pela ADR 020 (e-mail obrigatório só no fluxo público; pontos em aberto fechados)

**Contexto:** a reunião de requisitos fechou as regras em aberto desde 04/09
(`docs/reunioes/2026-09-04-pauta-requisitos.md`). As respostas foram anotadas no
roteiro da reunião e valem como entrada para o módulo de Disponibilidade/Agendamento.

**Decisões confirmadas:**

- **Aprovação manual.** O agendamento feito pelo paciente nasce `PENDING`; a dentista
  aprova (`CONFIRMED`) ou recusa. Recusa libera o horário.
- **Duração por procedimento.** Cada tipo de atendimento tem a sua duração. A cliente
  vai enviar a lista de procedimentos e tempos. Isso confirma a necessidade de uma
  entidade de serviço com `durationMinutes`.
- **Cancelamento pelo paciente sem prazo mínimo.** Pode cancelar até a hora da consulta.
- **Horário semanal** (almoço fixo das 11:00 às 13:30 todos os dias):

  | Dia | Manhã | Tarde |
  |---|---|---|
  | Segunda | 08:00–11:00 | 13:30–17:00 |
  | Terça | 08:00–11:00 | 13:30–16:30 |
  | Quarta | 08:00–11:00 | 13:30–17:00 |
  | Quinta | 08:00–11:00 | 13:30–16:30 |
  | Sexta | 08:00–10:30 | — |
  | Sábado/domingo | — | — |

- **Fecha em todos os feriados nacionais.**
- **Sem limite de horizonte:** o paciente pode marcar em qualquer data futura.
- **Sem antecedência mínima:** pode marcar qualquer horário livre, inclusive em cima da hora.
- **Notificação por e-mail.** WhatsApp fica para depois.
- **E-mail do paciente passa a ser obrigatório** no agendamento, junto com nome e telefone.
- **Lembrete por e-mail:** consulta à tarde recebe o lembrete no dia; consulta de manhã
  recebe no dia anterior.

**Em aberto (resolver no brainstorm do módulo ou com a cliente):**

- Lista de procedimentos e durações (a cliente vai enviar).
- Intervalo entre horários: o roteiro marcou "30 em 30" e "de hora em hora".
- Se o horário pendente fica bloqueado para outros pacientes enquanto aguarda aprovação.
- Quem escolhe o procedimento: o paciente ao marcar, ou a dentista depois.
- Bloqueios manuais (férias, cursos): a opção não foi marcada, mas o schema já suporta
  (`ScheduleException`).
- Horário de envio do lembrete.

**Fora do escopo deste sistema, mas relevante:** a cliente vai registrar o domínio
(2 anos, no CPF dela) e colocar o Vitor como contato técnico. O domínio importa aqui por
dois motivos: a ADR 018 exige API e web no mesmo domínio registrável, e o envio de
e-mail transacional precisa de registros DNS (SPF/DKIM) nesse domínio.

**Consequências:** muda o schema (e-mail obrigatório em `Patient`, serviço com duração)
e define o fluxo principal do agendamento (pendente → aprovado/recusado). Os detalhes
técnicos ficam para a spec do módulo.

---

## 020 — Modelo de dados e regras do módulo de Agenda e Agendamento (ajusta 006–010, 018, 019)

**Data:** 2026-10-28
**Status:** Proposta. Vira Aceita quando o usuário aprovar a spec
`docs/superpowers/specs/2026-10-28-agenda-e-agendamento-design.md`.

**Contexto:** a spec do módulo de Agenda e Agendamento (brainstorm de 28/10, depois da
reunião da ADR 019) muda decisões tomadas em 24/08, quando as regras da cliente ainda não
eram conhecidas. Esta ADR registra o que muda em cada ADR antiga e por quê. O detalhe
(campos, SQL, regras numeradas) fica na spec, citado por seção e por `RN-xx`. As escolhas
de implementação (camadas, lock, erros, dependências) são as ADRs 021 a 035, tiradas das
candidatas da `docs/architecture/arquitetura.md` §13.

**Decisão 1 — Bloqueios e feriados (ajusta 006).** A ideia da 006 continua valendo
(regras recorrentes + exceções, sem slots pré-gerados). Muda o formato da exceção:
- `ScheduleBlock` (faixa `[startAt, endAt)` livre, com `CHECK ("startAt" < "endAt")` e
  motivo visível só para a dentista) **substitui** `ScheduleException` e o enum
  `ExceptionType`. A tabela está vazia e o
  formato antigo (uma linha e uma faixa por dia) não representa férias de duas semanas
  nem um bloqueio no meio da manhã. Bloqueio de dia inteiro = `[00:00 local do 1º dia,
  00:00 local do dia seguinte ao último)` (spec 6.5).
- Feriados são **calculados em código** (`feriados(ano)`, pura): nacionais, municipais de
  BH e segunda/terça de Carnaval (spec 9.4, RN-08, RN-09). Sem API externa nem tabela,
  então não dependem de rede e são testáveis; mudança de lei exige mudança de código
  (raro). Carnaval e a lista de BH ainda precisam de confirmação da cliente (spec §12).
- `HolidayOverride` (uma data por linha) **desbloqueia** um feriado calculado (RN-46).
  Fica separado de `ScheduleBlock` porque bloqueio subtrai horário e desbloqueio só anula
  o feriado daquela data (spec 6.6).
- Grade de 30 min ancorada no início de cada faixa (RN-02); a duração inteira precisa
  caber numa faixa (RN-03).

**Decisão 2 — Predicado da exclusion constraint (ajusta 007).** O mecanismo da 007 não
muda. O `WHERE` passa de `status <> 'CANCELLED'` para
`status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED')`, mais `CHECK ("startAt" < "endAt")`
(spec 6.3). Lista **negativa** de propósito: um status novo ocupa o horário por padrão,
que é o lado seguro. Pendente ocupa o horário (RN-13). Os valores novos do enum entram
numa migration separada da que recria a constraint, porque o Postgres não deixa usar um
valor de enum na mesma transação do `ADD VALUE`.

**Decisão 3 — `Patient` e dados de contato (ajusta 008 e 019).**
- `Patient.email` é **nullable**. A ADR 019 disse "e-mail obrigatório" sem distinguir os
  fluxos: ele é obrigatório no formulário público (RN-10) e opcional na marcação direta da
  dentista (RN-30).
- `phone` guardado em **E.164** (normalizado na aplicação), continua `@unique` e é
  imutável na v1. Sem normalizar, o mesmo telefone digitado de dois jeitos vira dois
  pacientes.
- Deduplicação por telefone **sem sobrescrita** (RN-15): o pedido público nunca altera o
  `Patient`. Nome e e-mail digitados ficam no agendamento (`contactName`, `contactEmail`),
  e todos os e-mails daquele agendamento vão para o `contactEmail`. O painel sinaliza
  quando o pedido diverge do cadastro, e a dentista decide se atualiza o `Patient`.
- `Patient` pode ser apagado pelo expurgo (Decisão 6) quando fica sem agendamentos. A FK
  `Appointment.patientId` continua `RESTRICT` (spec 6.1).

**Decisão 4 — Token de cancelamento (ajusta 009).**
- Gerado na aplicação com `crypto.randomBytes(32)` em base64url (256 bits), não mais
  `@default(uuid())` (122 bits, fonte de aleatoriedade fora do nosso controle).
- **Nullable**: agendamento sem e-mail não tem link (RN-52). Gerado quando um e-mail é
  incluído, rotacionado quando o e-mail muda e anulado quando é removido (RN-38), para o
  endereço antigo perder o acesso.
- Guardado em **texto puro**, diferente do refresh token (ADR 017): o link é reenviado em
  vários e-mails depois da criação, e só com o hash não haveria como. Quem lê o banco já
  tem os dados dos pacientes; o impacto extra de um vazamento é cancelar agendamentos.
  HMAC foi considerado e não adotado (mais um segredo; rotacionar invalida todos os
  links).
- Cancelamento **só por POST** com o token no corpo (RN-51). No link, o token vai no
  **fragmento** (`/cancelar#token`), que não sai do navegador e não aparece em log
  (spec 10.4). A página é estática e lê o token de `location.hash`, então exige JS; usa
  `Referrer-Policy: no-referrer` e não carrega scripts de terceiros.
- Age só enquanto o agendamento é `PENDING`/`CONFIRMED` e `agora < startAt` (RN-50); depois
  só mostra o estado; depois do expurgo, "link inválido". Exceção: no pendente com prazo
  de 24h vencido, o `confirm` registra o cancelamento pelo sistema, mesmo depois do início
  (RN-54, T5b).

**Decisão 5 — Status e motivos (ajusta 010).**
- `AppointmentStatus` ganha `REJECTED` e `EXPIRED`. Alternativa rejeitada: tudo virar
  `CANCELLED` + motivo, que mistura "a dentista disse não" com "o paciente desistiu" em
  toda consulta e tela.
- `CancelledBy` ganha `SYSTEM`; novo enum `CancelReason { PATIENT, DENTIST, BLOCK,
  APPROVAL_TIMEOUT }`.
- Pedido criado com mais de 24h de antecedência que continua pendente quando faltam 24h
  para o início é cancelado pelo sistema (RN-23); pedido feito em cima da hora nunca é
  cancelado automaticamente e expira no início (RN-24, RN-25). As transições estão na
  tabela da spec §5 (`T1`–`T14`).
- `Appointment` ganha `source`, `contactName`, `contactEmail`, `closedAt`, `confirmedAt`,
  `rejectionMessage`, `suggestedStartAt`, `cancelReason`, e `serviceId` fica opcional com
  `onDelete: Restrict` explícito (o padrão do Prisma para relação opcional é `SetNull`).
  Índices novos `(status, startAt)` para os jobs e `(status, closedAt)` para o expurgo
  (spec 6.4).

**Decisão 6 — Auditoria, e-mail e retenção (nova).**
- **Trilha de auditoria** `AppointmentEvent`: uma linha por transição (T1–T13), com ator e
  estados/horários de antes e depois, sem dado pessoal (spec 6.7). Há ações automáticas
  (24h, expiração), e a dentista precisa responder "eu marquei e sumiu" com fato.
- **Outbox de e-mail** `Notification`, com `dedupeKey` único e retentativa (máx. 5): job
  duplicado ou evento repetido não envia dois e-mails, e falha de envio nunca bloqueia a
  agenda (spec 6.8, 9.6). Aceita na v1 a janela de perda entre o commit da transição e a
  gravação da notificação (a trilha de auditoria mostra a transição).
- **Expurgo de 7 dias (LGPD):** `REJECTED`, `CANCELLED` e `EXPIRED` são apagados 7 dias
  depois de `closedAt`, com eventos, notificações e o `Patient` que ficar órfão (RN-70).
  A retenção dos demais status está em aberto (RN-71, spec §12, item 4).

**Decisão 7 — Pontos em aberto da ADR 019, fechados na spec.**

| Ponto da 019 | Fechado em |
|---|---|
| Intervalo entre horários | Grade de 30 min (RN-02) |
| Pendente bloqueia o horário? | Sim (RN-13) |
| Quem escolhe o procedimento | Paciente, opcional (RN-10); sem procedimento reserva 30 min (RN-04); a dentista pode trocar na aprovação (RN-20) |
| Bloqueios manuais | `ScheduleBlock` (Decisão 1, RN-42) |
| Horário do lembrete | 07:00; tarde no mesmo dia, manhã no dia anterior (RN-62) |
| Lista de procedimentos | **Ainda em aberto** (spec §12, item 1); durações só 30, 60 ou 90 min (RN-05) |

**Decisão 8 — Topologia e cookie de sessão (atualiza 018, Decisão 2).** Domínio único
`draeloisapaiva.com.br`: o site institucional fica na raiz, a web em `agenda.`, a API em
`api.agenda.` e o envio de e-mail em `envio.` (spec 9.9). Continua um domínio registrável
só, então `sameSite: 'lax'` continua valendo. Problema: o cookie host-only gravado por
`api.agenda.` não chega a `agenda.`, e o `proxy.ts`/`getCurrentUser()` do Next nunca
veriam a sessão. Escolhida a **opção B** (usuário, 28/10): `COOKIE_DOMAIN` por env var
(ausente em dev, onde o cookie segue host-only; `agenda.draeloisapaiva.com.br` em
produção), aplicado no set **e** no clear do `cookie.util.ts`. A sessão fica restrita ao
sistema e não vai para o site institucional. Rejeitadas: A (`Domain` na raiz, que manda
o cookie para o site e para todo subdomínio futuro) e C (Next como proxy da API, que
acrescenta um hop e mexe no `trust proxy` da Decisão 3 da 018). `CORS_ORIGIN` só com
`https://agenda.draeloisapaiva.com.br`. `secure: true` em produção continua obrigatório.

**Consequências:** várias migrations na fatia 1, na ordem da `arquitetura.md` §4.2:
valores de enum antes da constraint, `ScheduleException` removida e SQL à mão
(constraint, CHECKs) com `int-spec` que prova cada um. O seed passa a fazer upsert do
`Professional` e a criar o horário da RN-01 só se a profissional ainda não tiver nenhum
(spec 6.9). `COOKIE_DOMAIN` entra antes do primeiro deploy, com teste e2e do atributo. As
dependências novas estão nas ADRs 022, 023, 033 e 035. Ficam fora e vêm depois: a ADR do
provedor de e-mail (fatia 4, spec 9.6) e a de hospedagem (spec §12, item 7; o processo
precisa ficar sempre ligado por causa dos jobs).

---

## 021 — Camadas no backend: domínio puro, casos de uso, infra e HTTP

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** as regras do módulo de Agenda (motor de disponibilidade, feriados, prazos de
24h, guardas `T1`–`T14`) são muitas e dependem de tempo. Precisam de teste rápido sem banco.
Já a correção sob concorrência depende de constraint, lock e `UPDATE` condicional, que só
existem no Postgres (arquitetura §13, ADR-C 1).

**Decisão:** quatro camadas por módulo, com o layout de pastas da `arquitetura.md` §2.2:
- `domain/`: TypeScript puro, sem `@nestjs/*` nem `@prisma/client`; `now`, fuso e dados
  entram por parâmetro (nunca `new Date()`/`Date.now()`). Contratos na arquitetura §2.3.
- `application/`: um caso de uso por classe, dono da transação e dos eventos (emitidos
  depois do commit).
- `infra/`: repositórios finos que recebem o `tx` e convertem erro do Prisma em erro de
  domínio, sem regra.
- `http/`: controllers finos (validam, tiram `professionalId` da sessão, chamam um caso de
  uso, apresentam). `jobs/` só chamam `service.run(clock.now())`.

A guarda pura e o `WHERE` do `UPDATE` condicional calculam o limite de tempo com a mesma
função (arquitetura §2.3).

**Alternativa rejeitada:** services Nest com Prisma direto e testes com Prisma mockado. O
mock não reproduz constraint, lock nem `UPDATE` condicional, justamente onde estão os bugs
de agenda.

**Consequências:** regras testáveis em unit, sem banco; casos de uso testados com Postgres
real (ADR 033); mais arquivos por feature. As regras de import viram lint quando possível
(guia §2.2).

---

## 022 — Luxon 3.7.2 e um único helper de fuso; dias como `YYYY-MM-DD` locais

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** toda regra de calendário (dia da semana, faixa, feriado, manhã/tarde, 07:00 do
lembrete, bloqueio de dia inteiro) é avaliada em `America/Sao_Paulo`, no backend também
(spec 9.1). Offset fixo `-03:00` é proibido: o horário de verão pode voltar. A spec §11 deixa
a biblioteca a critério de quem implementa.

**Decisão:** `luxon@3.7.2` + `@types/luxon@3.7.6`, versões exatas, no `apps/api` e no
`apps/web` (CJS confirmado; detalhes na arquitetura §2.12). Só `common/time/clinic-time.ts`
(api) e `src/lib/clinic-time.ts` (web) importam `luxon`, com regra de lint. Conversão para
UTC sempre por data, nunca por offset global. No fio: instantes em ISO UTC; dias de
calendário em `YYYY-MM-DD` no fuso da clínica (arquitetura §2.6). Relógio por porta
injetável `Clock` (`SystemClock` em produção, `FixedClock` nos testes). Processo da API com
`TZ=UTC`; o motor também é testado com outro `TZ` (CA-1.17).

**Alternativas rejeitadas:** `date-fns` + `@date-fns/tz` (duas dependências); Temporal (não
existe no Node 20 sem polyfill); offset fixo (quebra se o horário de verão voltar).

**Consequências:** um único ponto de revisão se o horário de verão voltar (atualizar a base
IANA basta). Qualquer `getHours()`/`getDay()` fora do helper é erro de revisão.

---

## 023 — `@nestjs/schedule@6.1.3` e `@nestjs/event-emitter@3.1.0` (linhas CJS)

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** o módulo precisa de jobs agendados (prazo de 24h/expiração, expurgo,
lembrete, envio de e-mail; spec 9.3) e de eventos entre módulos (ADR 003; spec 9.7: o
`@nestjs/event-emitter` ainda não está instalado). As linhas 12.x dos dois pacotes são
ESM-only (`npm view … type` = `module`, conferido em 2026-10-28) e quebram o `apps/api`,
que é CJS. É o mesmo caso do `@nestjs/jwt` (ADR 017).

**Decisão:** pinar `@nestjs/schedule@6.1.3` e `@nestjs/event-emitter@3.1.0`, versões exatas,
as últimas CJS com peer `@nestjs/common@^11`. Confirmar com um teste descartável de import
antes de instalar (guia §3.10). `ScheduleModule.forRoot()` só entra no `AppModule` se
`SCHEDULER_ENABLED !== 'false'`; os testes chamam `run(now)` direto (arquitetura §2.9).

**Alternativas rejeitadas:** a linha 12.x (ESM-only, quebra em runtime); range com `^` sem
pin (um update re-resolve para a 12.x, como alertado na ADR 017).

**Consequências:** um update sem pin quebra o boot. Revisitar quando o `apps/api` migrar para
ESM ou para o Nest 12.

---

## 024 — Modelo de erro com `code` estável

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** o front precisa decidir o que mostrar sem interpretar texto, e o fluxo
público não pode revelar o que a disponibilidade esconde (spec 10.3) nem se um telefone já
tem cadastro (RN-16). A spec já fixa os códigos públicos (RN-18, RN-19, CA-3.20)
(arquitetura §13, ADR-C 4).

**Decisão:** todo erro, inclusive o 400 do `ValidationPipe`, sai com o corpo
`{ statusCode, error, code, message, details? }`. Casos de uso lançam `DomainError(code,
details?)`, nunca `HttpException`; um filtro global traduz pela tabela da arquitetura §2.5 e
loga só 5xx, sem a `message` do Prisma. `details` nunca carrega valores digitados. No fluxo
público:
- 409 `SLOT_UNAVAILABLE` para qualquer horário não oferecível, seja qual for o motivo
  (RN-19, CA-3.10);
- 422 `BOOKING_NOT_ALLOWED` genérico para o limite por telefone (RN-16, RN-18);
- 404 `INVALID_LINK` único para token inexistente, malformado ou expurgado (CA-3.20).

**Alternativa rejeitada:** códigos distintos por motivo no fluxo público (ex.: "feriado",
"bloqueado", "limite por telefone"). Melhoraria a mensagem, mas revelaria ocupação, bloqueio
e cadastro (spec 10.3).

**Consequências:** o front decide por `code` (`apps/web/src/lib/api-errors.ts`); a única
`message` exibida como veio é a da RN-18. O público não distingue motivos. Código novo segue
a receita do guia §3.11 (`ErrorCode` no `shared-types`).

---

## 025 — Concorrência: lock consultivo transacional por profissional

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** a exclusion constraint (ADR 007, predicado da ADR 020) impede sobreposição
entre agendamentos, mas não enxerga `ScheduleBlock`, `HolidayOverride`, horário semanal nem
o `Patient` que o expurgo apaga (spec 9.2). Job, dentista e paciente também disputam a
mesma linha (spec §5).

**Decisão** (detalhe na arquitetura §2.8):
- `SELECT pg_advisory_xact_lock(hashtextextended('schedule:' || professionalId, 0))` como
  primeira instrução da transação nos fluxos da spec 9.2: pedido público (T1), marcação
  direta (T2), criar bloqueio (com RN-43), desfazer desbloqueio, editar horário semanal e
  expurgo (T14). O limite por telefone (RN-18) é contado dentro da transação de T1, depois
  do lock.
- Transições por `updateMany` condicional (`id`, status esperado, guarda de tempo) com `now`
  da aplicação, nunca o `now()` do Postgres; `count === 0` → relê e responde 409.
- T5b e T6 chamam a mesma função de repositório, para o resultado não depender de quem
  chega primeiro (RN-54).
- `AppointmentEvent` gravado só com `count === 1`, na mesma transação (CA-3.17).
- Eventos emitidos depois do commit; nenhum I/O externo dentro da transação (o captcha é
  verificado antes).

**Alternativas rejeitadas:** isolamento `SERIALIZABLE` no lugar de `READ COMMITTED` + lock
(exigiria retentativa por falha de serialização em todo caso de uso); lock em toda
transição (remarcar, aprovar, recusar, cancelar e editar contato não leem bloqueio nem
criam `Patient`, então não precisam); `now()` do
Postgres no `WHERE` (diverge do relógio falso dos testes e da guarda pura).

**Consequências:** não contradiz a ADR 007: a sobreposição continua garantida pela
constraint, e o lock cobre só o que ela não vê. Escritas de agenda serializadas por
profissional, custo desprezível no volume da clínica. Um pedido novo nunca reaproveita um
paciente que o expurgo está apagando (CA-3.30). Depois de um erro da constraint a transação está abortada: a lista de conflitos
do 409 é lida fora dela.

---

## 026 — Idempotência por comparação com os campos gravados (refina 011)

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** a ADR 011 criou `idempotencyKey` mas deixou para o módulo a definição de
"mesmo pedido". A RN-17 exige a chave no pedido público e na marcação direta, com 422 para
mesma chave e conteúdo diferente, e fixa a ordem honeypot → chave → captcha → transação,
porque o token do Turnstile é de uso único.

**Decisão** (detalhe na arquitetura §2.7): sem coluna de fingerprint. "Mesmo conteúdo" é o
pedido normalizado igual aos campos gravados (`startAt`, duração, `serviceId`, telefone
E.164, `contactName`, `contactEmail`, `notes`). Igual → mesma resposta (mesmo `id` e
token), sem evento e sem e-mail; diferente → 422 `IDEMPOTENCY_KEY_REUSED`. Corrida entre
dois retries: T1 e T2 pegam o lock da ADR 025, então o segundo espera o primeiro; logo
depois do lock ele repete a busca pela chave (em `READ COMMITTED` já vê a linha commitada)
e compara. Sem isso, cairia na checagem de disponibilidade com o horário ocupado pelo
próprio pedido. `P2002` no unique fica como rede de segurança. No fluxo público, a ordem é
a da RN-17.

**Alternativas rejeitadas:** coluna com hash do conteúdo (mais uma coluna e uma regra de
normalização a manter, para um caso que os campos gravados já cobrem); captcha antes da
chave (um retry legítimo falharia no captcha em vez de receber o pedido já criado, RN-17).

**Consequências:** a chave de um agendamento que já foi editado (remarcado, contato
corrigido) ou expurgado não "casa" mais: vira 422 ou pedido novo. Aceitável, porque retries
acontecem em segundos. Testes: CA-2.16, CA-3.6.

---

## 027 — E-mail: porta `EmailSender`, outbox com reserva, templates em TS puro

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** e-mail nunca pode bloquear a agenda, job duplicado não pode enviar dois
e-mails, e o provedor de produção ainda não foi escolhido (spec 9.6, 6.8). A ADR 020 já
decidiu a outbox `Notification`; faltava o mecanismo (arquitetura §13, ADR-C 7).

**Decisão** (detalhe na arquitetura §2.10):
- Porta `EmailSender` com três adaptadores: `provider` (`fetch` na API HTTP do provedor),
  `mailpit` (API HTTP de envio do Mailpit, em dev) e `fake` (testes, CA-4.20). Sem SMTP e
  sem `nodemailer`. `EMAIL_SENDER` diferente de `provider` em produção derruba o boot.
- O listener grava a `Notification` com `dedupeKey` = `${kind}:${auditEventId}` (lembrete:
  `reminder:${appointmentId}:${startAtISO}`) e `createdAt` pelo `Clock`, porque a regra do
  lembrete compara com ele (RN-63).
- Dispatcher reserva lotes com `FOR UPDATE SKIP LOCKED` e prazo de reserva; backoff de 1, 5,
  15 e 60 min; a 5ª falha vira `FAILED`; `lastError` sem dado pessoal.
- Templates são funções puras; o HTML sai de uma tag `html` que escapa toda interpolação
  (CA-4.13, RN-64). Sem biblioteca de template.

**Alternativas rejeitadas:** `nodemailer`/SMTP (dependência nova sem ganho: o envio é pela
API HTTP do provedor, spec 9.6 e 10.5); enviar dentro da transação (I/O externo na transação e e-mail
bloqueando a agenda); gravar a `Notification` na transação do agendamento para fechar a
janela de perda (o `scheduling` passaria a escrever na tabela do `notifications`, contra a
spec 9.7; a janela é aceita na v1, spec 9.6).

**Consequências:** entrega pelo menos uma vez: uma queda entre o aceite do provedor e o
`SENT` reenvia (se o provedor aceitar chave de idempotência, mandar `Notification.id`).
Nenhuma dependência nova de e-mail. A escolha do provedor continua para a ADR da fatia 4.

---

## 028 — `notifications` lê agendamentos pela porta `AppointmentReader` (refina 003)

**Data:** 2026-10-28
**Status:** Aceita (usuário, 2026-10-28)

**Contexto:** a ADR 003 diz que módulos não se chamam e só conversam por eventos. Mas o
`notifications` precisa de dados do agendamento para montar e-mails (destinatário, link,
procedimento) e para a regra do lembrete, que depende da tabela `Notification` (RN-63). A
spec 9.7 propõe uma porta de leitura.

**Decisão:** o `scheduling` exporta um provider somente leitura, `AppointmentReader`, que
devolve objetos simples, sem tipos do Prisma (`getSnapshot`, `listConfirmedStartingBetween`;
arquitetura §2.1). O `notifications` só importa `scheduling/contracts/**` (eventos e o
contrato do reader), garantido por `no-restricted-imports`. Os payloads dos eventos não têm
dado pessoal; o listener lê o resto pelo reader (arquitetura §2.4). O lembrete mora no
`notifications`. Sem escrita cruzada em nenhum sentido.

**Alternativas rejeitadas:** evento `appointment.reminder_due` emitido pelo `scheduling`
(o lembrete depende da `Notification`, que é do `notifications`; spec 9.7); o
`notifications` ler as tabelas do `scheduling` direto (acoplamento ao schema alheio, o que a
ADR 003 quer evitar); copiar os dados de contato no payload do evento (dado pessoal no
evento).

**Consequências:** é uma exceção explícita e só de leitura à regra da ADR 003. O contrato de
leitura vira API interna, versionada junto com os eventos em `scheduling/contracts/`.

---

## 029 — Frontend sem Server Actions

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** no Next.js 16, Server Actions são endpoints POST públicos
(`02-guides/server-actions.md`). O painel já autentica pela API (`JwtAuthGuard`, cookies do
Auth). Páginas públicas sem API de request-time são pré-renderizadas no `next build`
(arquitetura §3).

**Decisão** (detalhe na arquitetura §3.3):
- Leitura no painel em Server Components via `apiServer(path)` (`server-only`), que
  encaminha o cookie como o `getCurrentUser()` e manda para `/login` em 401.
- Mutação no painel: Client Component chama `apiFetch` (que já faz refresh em 401) e depois
  `router.refresh()`.
- Público: `publicFetch` com `credentials: 'omit'` para `/public/*`; página pública que lê a
  API usa `await connection()`.
- Server Actions proibidas (lint/revisão).

**Alternativa rejeitada:** Server Actions para as mutações. Cada uma é um endpoint POST
público do Next, ou seja, um segundo caminho de autenticação ao lado do `JwtAuthGuard`.

**Consequências:** um só caminho de autenticação, testado no e2e da API. O `next build` não
depende de a API estar no ar.

---

## 030 — `class-validator` autoritativo, Zod só no web, `shared-types` com build CJS

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** a ADR 013 fixou `ValidationPipe` com `class-validator` na API; a ADR 002 fala
em compartilhar "DTOs via Zod". O `packages/shared-types` ainda não tem build real, e este
módulo traz os primeiros tipos compartilhados (spec 9.8).

**Decisão:**
- Mantém a ADR 013: `class-validator` é o validador autoritativo na API, com validadores
  próprios em `common/validation/` (`@IsBrPhone`, `@NoControlChars`, `@IsLocalDate`,
  `@IsIsoInstant`). Normalização (trim, E.164, e-mail minúsculo) no caso de uso, não em
  `@Transform` (arquitetura §2.6).
- Zod, no `shared-types`, só dá feedback nos formulários do web. Isso esclarece a ADR 002:
  o que se compartilha são constantes, tipos e os schemas do front, não a validação da API.
- Limites (RN-05, RN-11) moram como constantes no `shared-types`. Uma tabela de exemplos
  válidos/inválidos roda contra os DTOs (api) e contra os schemas Zod (web).
- `shared-types` com `tsc` → `dist/` CJS, `zod` pinado em `3.25.76`, dependência
  `workspace:*` no api e no web, e `dev` do turbo com `dependsOn: ["^build"]`
  (arquitetura §3.7).

**Alternativas rejeitadas:** Zod autoritativo na API (troca o padrão da ADR 013 e do Auth já
pronto); `shared-types` consumido como fonte TS sem build (hoje `main`/`types` apontam
para `src/index.ts`, que o `apps/api` compilado, rodando em Node puro, não resolve em
runtime); build ESM (o `apps/api` é CJS).

**Consequências:** duas validações, com paridade garantida por teste, não por código único.
Resolve o TODO do build do `shared-types`.

---

## 031 — Calendário do painel próprio, edição por formulário antes de arrastar

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** o painel mostra a semana no fuso da clínica (não no do navegador, spec 9.1),
com linhas de 15 min (RN-05), faixas, bloqueios, feriados e destaques (RN-45, RN-46). A spec
§11 deixa a biblioteca e a interação a critério de quem implementa.

**Decisão** (detalhe na arquitetura §3.5): grade semanal própria em CSS grid (Tailwind),
com posições calculadas por `localMinuteOf` do `clinic-time.ts` do web. Edição primeiro por
formulário: o diálogo chama `POST /appointments/preview`, que devolve avisos de encaixe
(RN-34) e conflitos (RN-33). Arrastar/redimensionar vem depois e preenche o mesmo
formulário, sem mudar a API.

**Alternativa rejeitada:** FullCalendar ou react-big-calendar desde o início. Fuso nomeado
diferente do navegador é frágil nelas, e o estilo briga com o shadcn/ui. Plano B, se a grade
própria não der conta: FullCalendar com `timeZone` nomeado e `@fullcalendar/luxon3`.

**Consequências:** sem dependência pesada no web. Arrastar custa implementação própria e
fica para depois do formulário.

---

## 032 — CSRF por `Content-Type` nas mutações da API

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** `sameSite: 'lax'` (ADR 018) olha o site (domínio registrável), então o site
institucional e qualquer `*.draeloisapaiva.com.br` contam como "mesmo site" (spec 10.1, 9.9).
Um formulário HTML vindo de lá enviaria o cookie de sessão. O web chama
`POST /auth/refresh` e `/auth/logout` sem corpo.

**Decisão:** nas rotas de mutação da API (`POST/PUT/PATCH/DELETE`), qualquer `Content-Type`
presente que não seja `application/json` é recusado com 415 `UNSUPPORTED_MEDIA_TYPE`
(`json-only.middleware`, registrado no `configureApp`). Mutação sem corpo e sem
`Content-Type` é aceita (spec 10.1; arquitetura §10). Teste: CA-3.33.

**Alternativas rejeitadas:** confiar só no `sameSite` (não protege contra o mesmo site,
acima); recusar também mutação sem `Content-Type` (quebra o refresh e o logout do Auth
atual).

**Consequências:** compatível com o Auth atual. Protege contra formulário de qualquer
subdomínio do mesmo site, porque formulário HTML sempre envia `Content-Type`. Se um dia a
topologia virar cross-site, continua valendo o alerta da ADR 018 (Decisão 2).

---

## 033 — Infraestrutura de teste

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** hoje a app de teste é criada sem o setup do `main.ts`, cada e2e carrega o
`.env.test` à mão e não há suíte de integração nem testes no web (guia §4.2). Os critérios
de aceite da spec (`CA-x.y`) precisam ser rastreáveis até o teste.

**Decisão** (detalhe no guia §4):
- `configureApp()` em `common/configure-app.ts`, usado pelo `main.ts` e pelos testes.
- Jest em três suítes no api: unit (`*.spec.ts`), integração (`*.int-spec.ts`) e e2e
  (`*.e2e-spec.ts`). Integração e e2e com `--runInBand`, truncamento entre testes e
  `globalSetup` que roda `prisma migrate deploy` no `agendamento_test` e recusa banco cujo
  nome não termine em `_test`.
- No web: Vitest (+ Testing Library, jsdom) para helpers e Client Components, e Playwright
  para fluxos e Server Components `async` (o Vitest não os suporta).
- Todo critério vira `it('[CA-x.y] …')`.

**Alternativas rejeitadas:** manter a app de teste sem o setup do `main.ts` (os testes não
exercitariam `ValidationPipe`, Helmet, `trust proxy` e filtro de erro reais); Jest paralelo
em integração/e2e (banco compartilhado com truncamento); mockar Prisma nos casos de uso
(ADR 021).

**Consequências:** os testes passam a exercitar `ValidationPipe`, Helmet e `trust proxy`
reais. Entram dependências de teste no web (Vitest, Testing Library, jsdom, Playwright): as
versões exatas são escolhidas no dia da instalação pela regra do guia §3.10 (houve releases
nas últimas 2 semanas) e anotadas nesta ADR antes de ela virar Aceita.

---

## 034 — Dois throttlers nomeados, em memória

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** a criação de pedido público tem dois limites na mesma rota, 2/min e 5/hora
por IP (spec 10.2, CA-3.24). O `ThrottlerModule` atual (ADR 013) só tem o throttler
`default`, por minuto.

**Decisão:** registrar dois throttlers nomeados, `default` (60 s) e `hourly` (1 h), e usar
`@Throttle({ default: {…}, hourly: {…} })` nas rotas públicas com os números da spec 10.2.
O `hourly` global tem limite alto para não afetar as outras rotas (arquitetura §5).
Armazenamento em memória. O IP vem do `trust proxy` 1 (ADR 018, Decisão 3).

**Alternativas rejeitadas:** um throttler só (não expressa dois limites na mesma rota);
storage compartilhado (ex.: Redis) na v1 (só há uma instância; seria infraestrutura nova sem
ganho hoje).

**Consequências:** os contadores zeram a cada restart. Mais de uma instância exigiria
storage compartilhado.

---

## 035 — `libphonenumber-js@1.13.11` para telefone

**Data:** 2026-10-28
**Status:** Proposta

**Contexto:** o telefone precisa ser validado como número brasileiro e normalizado para
E.164 antes de busca e gravação (RN-11, RN-15; ADR 020, Decisão 3). A spec §11 sugere
`libphonenumber-js`, que já está no lockfile como dependência do `class-validator@0.15.1`.

**Decisão:** `libphonenumber-js@1.13.11` como dependência direta e exata do `apps/api`, na
mesma versão já resolvida pelo `class-validator` (pacote dual CJS/ESM). País padrão `BR`.
Usado em `domain/phone.ts` e no validador `@IsBrPhone()` (arquitetura §2.6).

**Alternativas rejeitadas:** outra versão (instalaria uma segunda cópia ao lado da do
`class-validator`); validação própria por regex (não acompanha as regras de numeração).

**Consequências:** uma cópia só da biblioteca. Rever a versão a cada ~6 meses, porque os
metadados de numeração envelhecem; ao atualizar, conferir a versão usada pelo
`class-validator`.

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
| 016 | `apps/web` no Next.js 16.x (mais recente) | Frontend |
| 017 | Correções técnicas do módulo Auth (`@nestjs/jwt` pinado em 11.0.2 por ESM, hash SHA-256 do refresh token) | Backend/Segurança |
| 018 | Trade-offs de segurança/deploy do Auth: logout não revoga access token, `sameSite: 'lax'` exige mesmo domínio registrável, `trust proxy` assume 1 hop | Backend/Segurança |
| 019 | Regras de agenda da reunião de 28/10: aprovação manual, duração por procedimento, horário semanal, feriados, e-mail obrigatório + lembrete | Negócio |
| 020 | Modelo do módulo de Agenda: `ScheduleBlock` + feriados calculados + `HolidayOverride`, predicado da constraint, `Patient.email` opcional e telefone E.164, token 256 bits no fragmento, `REJECTED`/`EXPIRED`/`SYSTEM`, auditoria, outbox, expurgo de 7 dias, cookie em `agenda.` (proposta) | Dados/Segurança |
| 021 | Camadas: `domain/` puro, `application/` dona da transação, `infra/` e `http/` finos (proposta) | Backend |
| 022 | Luxon 3.7.2 num único helper de fuso, `Clock` injetável, dias `YYYY-MM-DD` locais (proposta) | Backend/Frontend |
| 023 | `@nestjs/schedule@6.1.3` e `@nestjs/event-emitter@3.1.0` pinados nas linhas CJS (proposta) | Infra |
| 024 | Modelo de erro com `code` estável; códigos públicos únicos (`SLOT_UNAVAILABLE`, `BOOKING_NOT_ALLOWED`, `INVALID_LINK`) (proposta) | Backend/Segurança |
| 025 | Lock consultivo por profissional + `UPDATE` condicional com `now` da aplicação (proposta) | Concorrência |
| 026 | Idempotência por comparação com campos gravados; ordem honeypot → chave → captcha (proposta) | Backend/Segurança |
| 027 | E-mail: porta `EmailSender`, outbox com reserva e backoff, templates TS com escape (proposta) | Backend |
| 028 | `notifications` lê pelo `AppointmentReader`, só de `scheduling/contracts` (proposta) | Backend |
| 029 | Frontend sem Server Actions: `apiServer`/`apiFetch`/`publicFetch` (proposta) | Frontend/Segurança |
| 030 | `class-validator` autoritativo, Zod só no web, `shared-types` com build CJS (proposta) | Backend/Frontend |
| 031 | Calendário próprio em CSS grid, formulário antes de arrastar (proposta) | Frontend |
| 032 | CSRF: 415 para mutação com `Content-Type` não JSON (proposta) | Segurança |
| 033 | Infra de teste: `configureApp` compartilhado, Jest unit/int/e2e, Vitest + Playwright, `[CA-x.y]` (proposta) | Testes |
| 034 | Throttlers `default` + `hourly` em memória (proposta) | Segurança |
| 035 | `libphonenumber-js@1.13.11`, a mesma do `class-validator` (proposta) | Backend |
