import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';

export const API_DIR = resolve(__dirname, '../../../api');

/** Variáveis do `.env.test` da API (banco `agendamento_test`, credenciais do seed). */
export function loadApiTestEnv(): Record<string, string> {
  const parsed = parseEnv(readFileSync(resolve(API_DIR, '.env.test'), 'utf8'));
  return Object.fromEntries(
    Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
}

/** Recusa qualquer banco cujo nome não termine em `_test` (nunca truncar o de dev). */
export function assertTestDatabaseUrl(url: string | undefined): void {
  let dbName = '';
  try {
    dbName = new URL(url ?? '').pathname.replace(/^\//, '');
  } catch {
    // cai na recusa abaixo
  }
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `DATABASE_URL do e2e precisa apontar para um banco terminado em "_test" (recebido: "${dbName || 'inválida/ausente'}").`,
    );
  }
}

function run(cmd: string, args: string[], env: Record<string, string>): void {
  execFileSync(cmd, args, {
    cwd: API_DIR,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

// Roda dentro do apps/api para reutilizar o @prisma/client já gerado lá (o web não o tem).
// A lista de tabelas vem de pg_tables (sem entrada externa), como no truncateAll da API.
const TRUNCATE_SCRIPT = `
const { PrismaClient, Prisma } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw\`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'\`;
    if (rows.length) {
      const list = rows.map((r) => '"' + r.tablename.replace(/"/g, '""') + '"').join(', ');
      await prisma.$executeRaw\`\${Prisma.raw('TRUNCATE ' + list + ' RESTART IDENTITY CASCADE')}\`;
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
`;

/** Esvazia todas as tabelas (menos `_prisma_migrations`) do banco de teste. */
export function truncateAll(env: Record<string, string>): void {
  assertTestDatabaseUrl(env.DATABASE_URL);
  execFileSync(process.execPath, ['-e', TRUNCATE_SCRIPT], {
    cwd: API_DIR,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
}

export function migrateDeploy(env: Record<string, string>): void {
  assertTestDatabaseUrl(env.DATABASE_URL);
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], env);
}

export function seed(env: Record<string, string>): void {
  assertTestDatabaseUrl(env.DATABASE_URL);
  run('pnpm', ['exec', 'prisma', 'db', 'seed'], env);
}
