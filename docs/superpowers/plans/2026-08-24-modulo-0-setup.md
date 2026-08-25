# Módulo 0 — Monorepo, Banco e Constraint Anti-Colisão — Implementation Plan

> **Modo de execução deste projeto (ver `docs/superpowers/specs/2026-08-24-appointment-scheduling-schema-design.md`
> e memória `feedback-learning-mode`): este plano NÃO é para um agente executar sozinho de ponta a ponta.**
> Tarefas de boilerplate/scaffolding (1, 2, 3, 4, 5, 7, 8) podem ser executadas por Claude a pedido do usuário,
> já que não carregam valor de aprendizado. A Tarefa 6 (teste que prova que a exclusion constraint funciona sob
> concorrência) é para o usuário escrever, com Claude revisando — é o único ponto deste módulo com conteúdo
> técnico real de aprendizado (o restante é infraestrutura).

**Goal:** Transformar o design do schema (spec já aprovado) num monorepo rodando de verdade: NestJS + Next.js
scaffolded, Postgres local via Docker, Prisma conectado, migration aplicada com a exclusion constraint ativa,
e uma prova executável de que ela realmente impede overlap de agendamento sob concorrência.

**Architecture:** pnpm workspaces + Turborepo. `apps/api` (NestJS) fala com Postgres via Prisma; `apps/web`
(Next.js App Router) ainda não consome a API neste módulo — só precisa existir, buildar e rodar. `packages/shared-types`
existe como pacote vazio, linkado no workspace, pronto para os DTOs Zod dos módulos seguintes.

**Tech Stack:** pnpm, Turborepo 2, NestJS (TypeScript), Next.js (App Router) + Tailwind + shadcn/ui, PostgreSQL 16
(Docker Compose local), Prisma, Jest.

**Spec:** `docs/superpowers/specs/2026-08-24-appointment-scheduling-schema-design.md`

## Global Constraints

- Senha de banco/segredos nunca commitados — usar `.env` (git-ignorado) + `.env.example` versionado.
- `DATABASE_URL` deve incluir `connection_limit` explícito (requisito de performance do projeto: connection
  pooling configurado no Prisma, não deixado no padrão implícito).
- Nenhum dado sensível (senha, token) em log — ainda não há nada rodando isso neste módulo, mas o `main.ts`
  já deve vir com Helmet + CORS explícito (nunca `*`) desde o primeiro boot, não como retrofit depois.
- Toda migration que altera `Appointment` para prevenção de overlap usa a constraint definida na spec
  (seção 4) — não reinventar aqui.

---

### Tarefa 1: Scaffold do monorepo (pnpm workspace + Turborepo)

**Files:**
- Create: `package.json` (raiz)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Modify: mover `prisma/schema.prisma` para dentro de `apps/api/prisma/schema.prisma` (feito na Tarefa 4,
  depois que `apps/api` existir — por enquanto o arquivo continua na raiz)

**Interfaces:**
- Produces: workspace com `apps/*` e `packages/*` reconhecidos por pnpm/Turborepo; pacote
  `@sistema-agendamento/shared-types` instalável como dependência workspace (`workspace:*`) pelos apps
  futuros.

- [ ] **Step 1: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Criar `package.json` raiz**

```json
{
  "name": "sistema-agendamento-dr-eloisa",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.1.0"
  }
}
```

- [ ] **Step 3: Criar `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 4: Criar `.gitignore` na raiz**

```
node_modules/
.env
.env.*
!.env.example
dist/
.next/
.turbo/
*.log
```

- [ ] **Step 5: Criar `.nvmrc`**

```
20
```

- [ ] **Step 6: Scaffold do pacote `packages/shared-types` (vazio, pronto pra receber DTOs Zod nos próximos módulos)**

`packages/shared-types/package.json`:
```json
{
  "name": "@sistema-agendamento/shared-types",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

`packages/shared-types/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/shared-types/src/index.ts`:
```typescript
export {};
```

- [x] **Step 7: Rodar `pnpm install` na raiz e verificar que o workspace resolve**

Run: `pnpm install`
Expected: instala `turbo` e linka `@sistema-agendamento/shared-types` sem erro (ainda não há `apps/*`, tudo bem).

DONE (2026-08-24) — pnpm 9.12.0 instalado via `npm install -g pnpm@9.12.0` (corepack falhou por permissão em
`C:\Program Files\nodejs`). `pnpm install` resolveu sem erro.

- [x] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .nvmrc packages/shared-types
git commit -m "chore: scaffold pnpm workspace + turborepo monorepo"
```

DONE — commit `2f6c87f`. **Tarefa 1 concluída.**

---

### Tarefa 2: Postgres local via Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example` (raiz)

**Interfaces:**
- Produces: Postgres 16 acessível em `localhost:5432`, database `agendamento_dev` e `agendamento_test`,
  usuário/senha de desenvolvimento — consumido pela `DATABASE_URL` da Tarefa 4.

- [ ] **Step 1: Criar `docker-compose.yml` na raiz**

```yaml
services:
  postgres:
    image: postgres:16.15
    restart: unless-stopped
    environment:
      POSTGRES_USER: agendamento
      POSTGRES_PASSWORD: agendamento_dev_only
      POSTGRES_DB: agendamento_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agendamento -d agendamento_dev"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
```

`./docker/postgres-init/01-create-test-db.sql` (`CREATE DATABASE agendamento_test;`) roda automaticamente na
primeira inicialização do volume — sem isso, `docker compose down -v` ou uma máquina nova perderia o banco de
teste silenciosamente (achado do subagent de revisão pós-Tarefa 2).

- [ ] **Step 2: Criar `.env.example` na raiz**

```
DATABASE_URL="postgresql://agendamento:agendamento_dev_only@localhost:5432/agendamento_dev?connection_limit=10&pool_timeout=10"
DATABASE_URL_TEST="postgresql://agendamento:agendamento_dev_only@localhost:5432/agendamento_test?connection_limit=5&pool_timeout=10"
```

- [x] **Step 1** e **Step 2** DONE (2026-08-24) — `docker-compose.yml` e `.env.example` criados, ainda não
  commitados (aguardando verificação real do container antes de commitar, conforme o plano).

- [x] **Step 3: Subir o container e verificar saúde** — DONE (2026-08-25), `docker compose ps` mostrou
  `sistema_agendamento_dr_eloisa-postgres-1` como `Up ... (healthy)`.

- [x] **Step 4: Criar a segunda database (`agendamento_test`)** — DONE. Inicialmente criada manualmente, depois
  substituída por provisionamento automático: `docker/postgres-init/01-create-test-db.sql` montado em
  `/docker-entrypoint-initdb.d` no `docker-compose.yml`, rodado pelo Postgres na primeira inicialização do
  volume. Validado com `docker compose down -v && docker compose up -d` — os dois bancos (`agendamento_dev`,
  `agendamento_test`) aparecem sozinhos num ambiente do zero, sem passo manual. (Achado do subagent de
  revisão: sem isso, `docker compose down -v` ou uma máquina nova perderia o banco de teste silenciosamente.)
  Imagem também fixada em `postgres:16.15` (era `postgres:16` flutuante) pela mesma revisão.

- [x] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add local Postgres via Docker Compose"
```

DONE — commit `ea3fa71`. **Tarefa 2 concluída.**

---

### Tarefa 3: Scaffold do NestJS (`apps/api`) com segurança desde o boot

**Files:**
- Create: `apps/api/` (via Nest CLI)
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/.env.example`

**Interfaces:**
- Produces: API NestJS rodando em `http://localhost:3001`, com `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`,
  Helmet e CORS explícito já ativos — todo módulo futuro herda isso, não precisa reconfigurar.

DONE (2026-08-25) — Steps 1-6 executados exatamente como abaixo, sem desvio. Boot verificado: log JSON via
pino confirmando `Nest application successfully started`, `curl http://localhost:3001` retornou `200`.
Processo parado com `taskkill //F //IM node.exe` (Windows) antes do commit.

- [x] **Step 1: Rodar o Nest CLI dentro de `apps/`**

Run:
```bash
cd apps
npx @nestjs/cli new api --package-manager pnpm --skip-git
cd ..
```
Expected: pasta `apps/api` criada com a estrutura padrão do Nest (`src/app.module.ts`, `src/main.ts`, etc.)
e dependências instaladas.

- [x] **Step 2: Instalar dependências de segurança exigidas pelo projeto**

Run:
```bash
pnpm --filter api add helmet class-validator class-transformer @nestjs/throttler pino nestjs-pino argon2 dotenv
```
Expected: instala sem erro (essas libs cobrem os requisitos de segurança do projeto: Helmet, DTO validation,
rate limiting, logs estruturados, hash de senha, carregamento de `.env`).

- [x] **Step 3: Criar `apps/api/.env.example`**

```
PORT=3001
DATABASE_URL="postgresql://agendamento:agendamento_dev_only@localhost:5432/agendamento_dev?connection_limit=10&pool_timeout=10"
CORS_ORIGIN="http://localhost:3000"
```

- [x] **Step 4: Reescrever `apps/api/src/main.ts`**

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // Falha rápido em vez de deixar o CORS do Nest cair pro padrão "*" quando a env var
  // não está setada (comportamento do pacote `cors`: origin undefined == allow-all).
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN precisa estar definida (nunca usar "*" em produção)');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Sem isto, hooks como PrismaService.onModuleDestroy (fecha o pool de conexões) só
  // rodam em app.close() manual — nunca em SIGTERM/SIGINT reais (restart de container,
  // deploy, Ctrl+C). Achado real do subagent de revisão pós-Tarefa 4.
  app.enableShutdownHooks();

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

`import 'dotenv/config'` (pacote `dotenv`, instalado à parte) precisa vir antes de qualquer outro import que
leia `process.env` — sem ele nada carrega o `.env` pro processo, e o `CORS_ORIGIN` acima ficaria sempre
`undefined` mesmo com o arquivo `.env` existindo (achado real do subagent de revisão pós-Tarefa 3, corrigido
antes do commit).

- [x] **Step 5: Registrar `LoggerModule` (pino), `ThrottlerModule` e o guard de rate limiting em `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // nunca logar corpo bruto de requests com senha/token — cada módulo que
        // expuser rota sensível deve redigir explicitamente esses campos.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerModule.forRoot() só registra as opções — sem isto, nenhuma rota é
    // limitada de verdade. Módulos com rotas sensíveis (login, reset de senha) usam
    // @Throttle(...) por cima deste limite global pra apertar ainda mais.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

O `{ provide: APP_GUARD, useClass: ThrottlerGuard }` é o que efetivamente ativa o rate limiting — sem ele,
`ThrottlerModule.forRoot()` sozinho só registra as opções, nenhuma rota fica de fato limitada (achado real do
subagent de revisão pós-Tarefa 3, corrigido antes do commit; confirmado depois via headers
`X-RateLimit-Limit`/`X-RateLimit-Remaining` numa resposta real).

- [x] **Step 6: Rodar a API e confirmar boot**

Run: `pnpm --filter api dev`
Expected: log estruturado (JSON via pino) mostrando a API subindo na porta 3001, sem erro.
Pare o processo (Ctrl+C) antes do próximo passo.

- [x] **Step 7: Commit**

```bash
git add apps/api .gitignore
git commit -m "feat: scaffold NestJS api with helmet, validation, throttler and pino logging"
```

DONE — commit `1a2eccf`. **Tarefa 3 concluída.**

---

### Tarefa 4: Prisma dentro de `apps/api`

**Files:**
- Modify: mover `prisma/schema.prisma` (raiz) → `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts` (importar `PrismaModule`)

**Interfaces:**
- Consumes: `apps/api/prisma/schema.prisma` (já definido na Tarefa de design, não muda aqui).
- Produces: `PrismaService` injetável em qualquer módulo Nest futuro via `PrismaModule` (global), com
  `onModuleInit`/`onModuleDestroy` conectando e desconectando do pool.

- [x] **Step 1: Instalar Prisma e mover o schema**

Run:
```bash
pnpm --filter api add @prisma/client@6.19.3
pnpm --filter api add -D prisma@6.19.3
mkdir -p apps/api/prisma
git mv prisma/schema.prisma apps/api/prisma/schema.prisma
rmdir prisma
```
Expected: `apps/api/prisma/schema.prisma` existe com o conteúdo já definido na spec; a pasta `prisma/` da raiz
não existe mais.

**IMPORTANTE — pin explícito de versão, não use `@latest` implícito:** rodar `pnpm --filter api add
@prisma/client` e `add -D prisma` sem versão (2026-08-25) resolveu `@prisma/client@^7.10.0` mas `prisma@8.0.0-
rc.10` — major version diferente entre CLI e client, e o `8.0.0-rc.10` puxou pacotes completamente estranhos
(`workerd`, `alchemy` — ferramental de Cloudflare Workers, sem relação com Postgres local). Além disso, o
Prisma 7 **remove suporte a `url` dentro de `datasource` no `schema.prisma`** (exige `prisma.config.ts` +
driver adapter tipo `@prisma/adapter-pg` passado pro `PrismaClient`) — quebra o padrão `datasource { url =
env("DATABASE_URL") }` que a spec de design já define, e é recente demais pra ter documentação/tutoriais
maduros (ruim pro objetivo de aprendizado do projeto). Por isso: **sempre pinar `prisma` e `@prisma/client` na
mesma versão exata 6.x** (verificar a última 6.x estável antes de instalar, não confiar no dist-tag `latest`).

**Também acrescentar a `apps/api/package.json`, dentro de `scripts`:**
```json
"postinstall": "prisma generate",
```
Sem isto, `node_modules/.prisma` (gitignorado, é build artifact) só existe enquanto alguém rodou `prisma
generate` manualmente — um clone novo, CI, ou build de Docker quebra na primeira importação de
`@prisma/client`. Achado real do subagent de revisão pós-Tarefa 4: o client gerado não sobrevivia a uma
reinstalação limpa. Verificado apagando `node_modules/.prisma` e confirmando que `pnpm install` regenera
sozinho via este hook.

- [x] **Step 2: Criar `apps/api/src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [x] **Step 3: Criar `apps/api/src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`@Global()` aqui é intencional: `PrismaService` é infraestrutura consumida por praticamente todo módulo de
domínio (services, patients, appointments...). Deixar global evita reimportar `PrismaModule` em cada
`*.module.ts` novo — é uma exceção justificada ao princípio geral de módulos explícitos, não o padrão do
projeto (módulos de domínio continuam se comunicando só via eventos, nunca chamada direta).

- [x] **Step 4: Importar `PrismaModule` em `apps/api/src/app.module.ts`**

(código real inclui também o `APP_GUARD`/`ThrottlerGuard` da correção pós-Tarefa 3 — ver Tarefa 3 acima; aqui
só o import/registro do `PrismaModule` muda)

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

- [x] **Step 5: Copiar `DATABASE_URL` real para `apps/api/.env` (não commitado) e gerar o client**

Run:
```bash
cp apps/api/.env.example apps/api/.env
pnpm --filter api exec prisma generate
```
Expected: `Generated Prisma Client` sem erro. Confirmado com Prisma 6.19.3 — `Generated Prisma Client (v6.19.3)`
sem erro. Boot completo da API depois disso também confirmado (`PrismaModule dependencies initialized`,
`curl` retornando 200).

- [x] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat: integrate Prisma into NestJS api via PrismaService/PrismaModule"
```

DONE — commit `cc10024`. **Tarefa 4 concluída.**

---

### Tarefa 5: Migration com a exclusion constraint anti-overlap

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_init/migration.sql` (gerado + editado à mão)

**Interfaces:**
- Consumes: SQL exato definido na spec, seção 4.
- Produces: banco `agendamento_dev` com todas as tabelas do schema + a constraint `no_overlapping_appointments`
  realmente ativa — é o que a Tarefa 6 vai provar.

- [ ] **Step 1: Gerar a migration sem aplicar**

Run: `pnpm --filter api exec prisma migrate dev --create-only --name init`
Expected: cria `apps/api/prisma/migrations/<timestamp>_init/migration.sql` com o `CREATE TABLE` de todas as
entidades, mas ainda não aplica no banco.

- [ ] **Step 2: Abrir o `migration.sql` gerado e acrescentar, no final do arquivo, exatamente este bloco**
(copiado da spec, seção 4 — não reformular):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE (status <> 'CANCELLED');
```

- [ ] **Step 3: Aplicar a migration no banco de desenvolvimento**

Run: `pnpm --filter api exec prisma migrate dev`
Expected: `Your database is now in sync with your schema.` — sem erro. Se der erro de extensão
(`permission denied to create extension`), confirme que o usuário `agendamento` do Docker Compose é dono do
banco (é, por padrão, no compose da Tarefa 2).

- [ ] **Step 4: Aplicar a mesma migration no banco de teste**

Run: `DATABASE_URL="$DATABASE_URL_TEST" pnpm --filter api exec prisma migrate deploy`
(ajuste a variável conforme o shell — no PowerShell seria `$env:DATABASE_URL=$env:DATABASE_URL_TEST; ...`)
Expected: mesma confirmação de sucesso, agora em `agendamento_test`.

- [ ] **Step 5: Verificar manualmente que a constraint existe**

Run: `docker compose exec postgres psql -U agendamento -d agendamento_dev -c "\d+ \"Appointment\""`
Expected: a saída lista `no_overlapping_appointments` como `Exclusion constraints`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations
git commit -m "feat: apply initial migration with anti-overlap exclusion constraint"
```

---

### Tarefa 6: Provar que a constraint impede overlap sob concorrência (VOCÊ escreve esta)

**Files:**
- Create: `apps/api/test/appointment-overlap.e2e-spec.ts`
- Create: `apps/api/test/jest-e2e.json` (config do Jest pro diretório `test/`, se o Nest CLI não tiver criado)

**Interfaces:**
- Consumes: `PrismaService` (Tarefa 4) — mesma API: `prisma.professional.create(...)`,
  `prisma.service.create(...)`, `prisma.patient.create(...)`, `prisma.appointment.create(...)`.
- Produces: nada consumido por tarefas futuras — este teste é uma prova, não uma dependência.

**Objetivo do exercício:** escrever um teste que (1) cria as linhas base necessárias (`Professional`,
`Service`, `Patient`), (2) tenta criar **dois agendamentos que se sobrepõem no tempo, para o mesmo
`professionalId`, concorrentemente**, e (3) confirma que exatamente um deles é aceito e o outro falha com o
erro de exclusion violation do Postgres.

**Pistas técnicas (não é a solução):**
- Dispare as duas criações "ao mesmo tempo" com `Promise.allSettled([...])`, não `await` sequencial — sequencial
  nunca testaria concorrência de verdade, só ordem.
- O erro do Prisma quando a constraint barra o insert é uma `Prisma.PrismaClientKnownRequestError`. Ela tem um
  campo `.code` — para uma constraint que o Prisma não conhece nativamente (como um `EXCLUDE`, que não é
  unique/foreign key/not-null), o código genérico é `'P2004'` ("A constraint failed on the database"), e
  `error.meta` traz a mensagem original do Postgres, que inclui o nome da constraint
  (`no_overlapping_appointments`) e o código nativo `23P01`. (`P2010` é só para erros de `$queryRaw`/
  `$executeRaw` — não é o caso aqui, já que o teste usa `prisma.appointment.create()` normal.) Inspecione o
  objeto do erro (`console.log(JSON.stringify(error, null, 2))`) durante o desenvolvimento do teste pra ver o
  formato exato antes de escrever o `expect`.
- Dois agendamentos que "colidem" não precisam ter o mesmo horário de início — teste também o caso de overlap
  parcial (ex: um das 14:00 às 15:00, outro das 14:30 às 15:30) pra provar que não é só um unique constraint
  disfarçado.
- Depois de testar a colisão, adicione um terceiro caso: dois agendamentos em horários que **não** se
  sobrepõem devem ambos ser aceitos sem erro — senão o teste não prova nada (poderia estar falhando por
  qualquer outro motivo).

- [ ] **Step 1: Configurar `DATABASE_URL` do teste**

Antes de rodar, o processo de teste precisa apontar pro banco `agendamento_test` (Tarefa 5, Step 4), não pro
de desenvolvimento — senão os testes escrevem dados de teste no banco "real". Use um `.env.test` em
`apps/api/.env.test` com o mesmo valor de `DATABASE_URL_TEST` do `.env.example` da raiz, e carregue-o no
começo do arquivo de teste com `dotenv-cli` ou lendo o arquivo manualmente antes de instanciar o
`PrismaClient`.

- [ ] **Step 2: Escrever o esqueleto do teste em `apps/api/test/appointment-overlap.e2e-spec.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

describe('Appointment overlap prevention (exclusion constraint)', () => {
  const prisma = new PrismaClient();
  let professionalId: string;
  let serviceId: string;
  let patientId: string;

  beforeAll(async () => {
    // TODO(você): criar um Professional, um Service (com durationMinutes) e um
    // Patient de teste, e guardar os ids nas variáveis acima.
  });

  afterAll(async () => {
    // TODO(você): limpar os dados criados (appointments, depois professional/service/patient)
    // e desconectar o Prisma.
  });

  it('rejects two overlapping appointments for the same professional created concurrently', async () => {
    // TODO(você):
    // 1. Definir dois intervalos de tempo que se sobrepõem parcialmente.
    // 2. Disparar as duas criações concorrentemente com Promise.allSettled.
    // 3. Verificar que uma teve status 'fulfilled' e a outra 'rejected'.
    // 4. Verificar que o motivo da rejeitada é especificamente a exclusion constraint
    //    (não qualquer erro — ver "Pistas técnicas" no plano).
  });

  it('accepts two non-overlapping appointments for the same professional', async () => {
    // TODO(você): mesma estrutura do teste acima, mas com horários que não colidem.
    // As duas devem ter status 'fulfilled'.
  });
});
```

- [ ] **Step 3: Implementar os `TODO`s**

Sem código pronto aqui — use as pistas técnicas acima. Quando travar de verdade (não só "não sei por onde
começar", mas already tentou e não funcionou), me chame que reviso o que você escreveu antes de qualquer
sugestão de código.

- [ ] **Step 4: Rodar o teste e confirmar os três casos**

Run: `pnpm --filter api exec jest --config test/jest-e2e.json appointment-overlap`
Expected: 2 testes passando — o de overlap (uma criação aceita, outra rejeitada pela constraint certa) e o
de não-overlap (as duas aceitas).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test
git commit -m "test: prove exclusion constraint prevents overlapping appointments under concurrency"
```

---

### Tarefa 7: Scaffold do Next.js (`apps/web`)

**Files:**
- Create: `apps/web/` (via create-next-app)

**Interfaces:**
- Produces: app Next.js rodando em `http://localhost:3000`, App Router + Tailwind + shadcn/ui prontos —
  nenhuma página real ainda (fica para o módulo da página pública de agendamento).

- [ ] **Step 1: Rodar create-next-app dentro de `apps/`**

Run:
```bash
cd apps
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack
cd ..
```
Expected: pasta `apps/web` criada com App Router, Tailwind e ESLint configurados.

- [ ] **Step 2: Inicializar shadcn/ui**

Run:
```bash
cd apps/web
npx shadcn@latest init -d
cd ../..
```
Expected: cria `apps/web/components.json` e ajusta `apps/web/src/app/globals.css` com as variáveis de tema do
shadcn. Se o CLI perguntar algo (estilo, cor base), aceite os valores padrão por enquanto — a identidade
visual da clínica entra no módulo de design da página pública.

- [ ] **Step 3: Rodar o dev server e confirmar boot**

Run: `pnpm --filter web dev`
Expected: Next.js sobe em `http://localhost:3000`, página padrão do `create-next-app` carrega sem erro no
navegador. Pare o processo antes do próximo passo.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat: scaffold Next.js app with Tailwind and shadcn/ui"
```

---

### Tarefa 8: Wiring final do monorepo e smoke test

**Files:**
- Modify: `apps/api/package.json` (garantir script `dev` correto)
- Modify: `apps/web/package.json` (garantir script `dev` correto)
- Create: `README.md` (raiz)

**Interfaces:**
- Produces: `pnpm dev` na raiz sobe `apps/api` (porta 3001) e `apps/web` (porta 3000) juntos via Turborepo —
  é o comando que abre qualquer sessão de trabalho a partir de agora.

- [ ] **Step 1: Confirmar que `apps/api/package.json` e `apps/web/package.json` têm um script `dev`**

Nest CLI e create-next-app já geram isso por padrão (`nest start --watch` e `next dev`, respectivamente) —
só confira que os nomes dos scripts são exatamente `dev`, já que é o que `turbo.json` (Tarefa 1) espera.

- [ ] **Step 2: Criar `README.md` na raiz**

```markdown
# Sistema de Agendamento — Clínica Dra. Eloísa

Monorepo (pnpm + Turborepo): `apps/api` (NestJS) + `apps/web` (Next.js) + `packages/shared-types`.

## Setup local

1. `cp .env.example .env` e `cp apps/api/.env.example apps/api/.env` — ajuste se necessário.
2. `docker compose up -d` — sobe o Postgres local.
3. `pnpm install`
4. `pnpm --filter api exec prisma migrate deploy` — aplica as migrations existentes.
5. `pnpm dev` — sobe api (`:3001`) e web (`:3000`) juntos.
```

- [ ] **Step 3: Smoke test — subir tudo junto pela raiz**

Run: `pnpm dev`
Expected: logs de `api` e `web` intercalados no mesmo terminal (Turborepo prefixa cada linha com o nome do
app), ambos servindo sem erro. Acesse `http://localhost:3000` e `http://localhost:3001` para confirmar.
Pare com Ctrl+C.

- [ ] **Step 4: Commit final do módulo**

```bash
git add README.md apps/api/package.json apps/web/package.json
git commit -m "chore: wire up root dev script and document local setup"
```

## Definição de pronto do Módulo 0

- [ ] `pnpm dev` sobe api + web juntos sem erro
- [ ] `docker compose ps` mostra Postgres `healthy`
- [ ] A migration com `no_overlapping_appointments` está aplicada em `agendamento_dev` e `agendamento_test`
- [ ] O teste da Tarefa 6 passa e prova (não assume) que a constraint bloqueia overlap sob concorrência real
- [ ] Nenhum segredo (senha do Postgres, etc.) commitado — só `.env.example`

Próximo módulo (Auth) começa com seu próprio ciclo de brainstorm → spec → plano, já com api/web/banco rodando
de verdade.
