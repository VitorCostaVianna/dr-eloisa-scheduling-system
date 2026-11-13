import { rmSync } from 'node:fs';
import { loadApiTestEnv, migrateDeploy, seed, truncateAll } from './db';
import { SESSION_FILE } from './session';

// Prepara o `agendamento_test`: migrations, tabelas vazias e seed da dentista (credenciais
// do .env.test da API). Roda uma vez antes dos testes, depois dos webServers subirem.
// A API sobe antes do migrate: isso só funciona porque o Prisma conecta de forma
// preguiçosa; se o boot da API passar a consultar o banco, mover o migrate para antes.
export default function globalSetup(): void {
  // Sessão salva de uma execução anterior não vale: o truncate apaga a dentista e as sessões.
  rmSync(SESSION_FILE, { force: true });
  const env = loadApiTestEnv();
  migrateDeploy(env);
  truncateAll(env);
  seed(env);
}
