# Sistema de Agendamento — Clínica Dra. Eloísa

Monorepo (pnpm + Turborepo): `apps/api` (NestJS) + `apps/web` (Next.js) + `packages/shared-types`.

Decisões de arquitetura e o porquê de cada uma: [`docs/decisions.md`](docs/decisions.md).
Specs e planos de implementação por módulo: [`docs/superpowers/`](docs/superpowers/).

## Setup local

1. `cp .env.example .env` e `cp apps/api/.env.example apps/api/.env` — ajuste se necessário.
2. `docker compose up -d` — sobe o Postgres local (cria `agendamento_dev` e `agendamento_test`
   automaticamente).
3. `pnpm install`
4. `pnpm --filter api exec prisma migrate deploy` — aplica as migrations existentes.
5. `pnpm dev` — sobe `api` (`:3001`) e `web` (`:3000`) juntos.

Pra rodar os testes de integração da API (`apps/api/test/`), copie também
`cp apps/api/.env.test.example apps/api/.env.test` antes.

## Stack

- **Backend:** NestJS + TypeScript, Prisma + PostgreSQL
- **Frontend:** Next.js (App Router) + Tailwind + shadcn/ui
- **Segurança:** Helmet, CORS explícito, rate limiting (`@nestjs/throttler`), `ValidationPipe`
  com whitelist, argon2, logs estruturados (pino) sem dado sensível
- **Banco:** Postgres local via Docker Compose; prevenção de conflito de horário via
  exclusion constraint (ver ADR 007 em `docs/decisions.md`)
