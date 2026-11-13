import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { PublicProcedureDto } from '@sistema-agendamento/shared-types';
import { loginAsDentist } from '../support/login';

const API_URL = 'http://localhost:3001';

// Camada P. Tarefa 15. O banco é compartilhado e só é limpo no início da suíte: cada teste
// usa um nome único, para não depender de ordem nem de execuções anteriores.
test.describe('[P] procedimentos', () => {
  test('[P] cria, aparece na lista, desativa e some da lista pública', async ({ page, request }) => {
    // Dado a dentista logada e um nome único
    const name = `Limpeza ${randomUUID().slice(0, 8)}`;
    await loginAsDentist(page);
    await page.goto('/dashboard/procedimentos');

    // Quando cria o procedimento com 60 min
    await page.getByLabel('Nome').fill(name);
    await page.getByRole('combobox', { name: 'Duração' }).click();
    await page.getByRole('option', { name: '60 min' }).click();
    await page.getByRole('button', { name: 'Criar procedimento' }).click();

    // Então aparece na lista, ativo, com 60 min
    const item = page
      .getByRole('list', { name: 'Procedimentos' })
      .getByRole('listitem')
      .filter({ hasText: name });
    await expect(item).toBeVisible();
    await expect(item).toContainText('60 min');
    await expect(item.getByText('inativo')).toHaveCount(0);

    // E a lista pública o contém enquanto ativo
    const before = await request.get(`${API_URL}/public/procedures`);
    expect(before.ok()).toBe(true);
    expect(((await before.json()) as PublicProcedureDto[]).map((p) => p.name)).toContain(name);

    // Quando desativa
    await page.getByRole('button', { name: `Desativar ${name}` }).click();

    // Então mostra "inativo" e oferece Reativar
    await expect(item.getByText('inativo')).toBeVisible();
    await expect(page.getByRole('button', { name: `Reativar ${name}` })).toBeVisible();

    // E a lista pública não o contém mais
    const after = await request.get(`${API_URL}/public/procedures`);
    expect(after.ok()).toBe(true);
    expect(((await after.json()) as PublicProcedureDto[]).map((p) => p.name)).not.toContain(name);
  });

  test('[P] nome repetido mostra a mensagem de PROCEDURE_NAME_TAKEN', async ({ page }) => {
    // Dado um procedimento recém-criado
    const name = `Duplicado ${randomUUID().slice(0, 8)}`;
    await loginAsDentist(page);
    await page.goto('/dashboard/procedimentos');
    await page.getByLabel('Nome').fill(name);
    await page.getByRole('button', { name: 'Criar procedimento' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible();

    // Quando tenta criar outro com o mesmo nome
    await page.getByLabel('Nome').fill(name);
    await page.getByRole('button', { name: 'Criar procedimento' }).click();

    // Então
    // O Next injeta outro role="alert" (route announcer): filtra pelo texto da UI.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Já existe um procedimento com esse nome.' }),
    ).toBeVisible();
  });
});

test.describe('[P] horário semanal', () => {
  test('[P] mostra o horário do seed (RN-01), só leitura', async ({ page }) => {
    // Dado a dentista logada
    await loginAsDentist(page);
    // Quando abre o horário
    await page.goto('/dashboard/horario');
    // Então
    await expect(page.getByRole('heading', { name: 'Horário de atendimento' })).toBeVisible();
    await expect(page.getByText('Segunda-feira 08:00–11:00 · 13:30–17:00')).toBeVisible();
    await expect(page.getByText('Terça-feira 08:00–11:00 · 13:30–16:30')).toBeVisible();
    await expect(page.getByText('Sexta-feira 08:00–10:30')).toBeVisible();
    await expect(page.getByText('Sábado Sem atendimento')).toBeVisible();
    await expect(page.getByText('Domingo Sem atendimento')).toBeVisible();
  });
});
