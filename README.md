# Dr. Eloísa Dental Clinic — Scheduling System

Monorepo (pnpm + Turborepo): `apps/api` (NestJS) + `apps/web` (Next.js) + `packages/shared-types`.

Architectural decisions and the reasoning behind each one: [`docs/decisions.md`](docs/decisions.md).
Per-module specs and implementation plans: [`docs/superpowers/`](docs/superpowers/).

## Local setup

1. `cp .env.example .env` and `cp apps/api/.env.example apps/api/.env` — adjust as needed.
2. `docker compose up -d` — starts local Postgres (creates `agendamento_dev` and
   `agendamento_test` automatically).
3. `pnpm install`
4. `pnpm --filter api exec prisma migrate deploy` — applies existing migrations.
5. `pnpm dev` — starts `api` (`:3001`) and `web` (`:3000`) together.

To run the API's integration tests (`apps/api/test/`), also copy
`cp apps/api/.env.test.example apps/api/.env.test` first.

## Stack

- **Backend:** NestJS + TypeScript, Prisma + PostgreSQL
- **Frontend:** Next.js (App Router) + Tailwind + shadcn/ui
- **Security:** Helmet, explicit CORS, rate limiting (`@nestjs/throttler`), `ValidationPipe`
  with whitelist, argon2, structured logging (pino) with no sensitive data
- **Database:** local Postgres via Docker Compose; schedule-conflict prevention via an
  exclusion constraint (see ADR 007 in `docs/decisions.md`)
