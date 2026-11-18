import { defineConfig, devices } from '@playwright/test';
import { loadApiTestEnv } from './e2e/support/db';

const apiEnv = loadApiTestEnv();
const API_PORT = 3001;
const WEB_PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  // Um único banco compartilhado: sem paralelismo entre arquivos/testes.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/support/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API com o banco de teste; migrations/seed ficam por conta do globalSetup.
      command: 'pnpm --filter api build && pnpm --filter api start:prod',
      cwd: '..',
      url: `http://localhost:${API_PORT}/`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...apiEnv,
        PORT: String(API_PORT),
        SCHEDULER_ENABLED: 'false',
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        TZ: 'UTC',
      },
    },
    {
      command: 'pnpm build && pnpm start',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`, PORT: String(WEB_PORT) },
    },
  ],
});
