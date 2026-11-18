import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Page } from '@playwright/test';
import { loadApiTestEnv } from './db';
import { SESSION_FILE } from './session';

/** Login sempre pela tela (sem reaproveitar sessão). Para o teste que exercita o próprio login. */
export async function loginAsDentistViaUi(page: Page): Promise<void> {
  await loginViaUi(page);
}

async function loginViaUi(page: Page): Promise<void> {
  const env = loadApiTestEnv();
  await page.goto('/login');
  await page.getByLabel('Email').fill(env.SEED_DENTIST_EMAIL);
  await page.getByLabel('Senha').fill(env.SEED_DENTIST_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/dashboard\/agenda/);
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  await page.context().storageState({ path: SESSION_FILE });
}

/**
 * Entra como a dentista do seed e espera chegar em /dashboard/agenda. O login da API tem limite de
 * 5/min por IP (spec de auth) e a suíte faz mais logins que isso: só o primeiro passa pela tela;
 * os demais reaproveitam os cookies salvos. Se a sessão salva não valer mais, cai no login pela tela.
 */
export async function loginAsDentist(page: Page): Promise<void> {
  if (existsSync(SESSION_FILE)) {
    const saved = JSON.parse(await readFile(SESSION_FILE, 'utf8')) as {
      cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0];
    };
    await page.context().addCookies(saved.cookies);
    await page.goto('/dashboard/agenda');
    if (/\/dashboard\/agenda/.test(page.url())) return;
    await page.context().clearCookies();
  }
  await loginViaUi(page);
}
