import type { Page } from '@playwright/test';
import { loadApiTestEnv } from './db';

/** Faz login pela tela com a dentista do seed e espera sair de /login. */
export async function loginAsDentist(page: Page): Promise<void> {
  const env = loadApiTestEnv();
  await page.goto('/login');
  await page.getByLabel('Email').fill(env.SEED_DENTIST_EMAIL);
  await page.getByLabel('Senha').fill(env.SEED_DENTIST_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/dashboard\/agenda/);
}
