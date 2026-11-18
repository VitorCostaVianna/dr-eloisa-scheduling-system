import { config } from 'dotenv';
import { execSync } from 'child_process';
import { resolve } from 'path';

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
      `DATABASE_URL dos testes precisa apontar para um banco terminado em "_test" (recebido: "${dbName || 'inválida/ausente'}"). Recusando rodar para não truncar o banco de desenvolvimento.`,
    );
  }
}

export default function globalSetup(): void {
  config({ path: resolve(__dirname, '../../.env.test') });
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: process.env,
    stdio: 'inherit',
  });
}
