import { expect, test } from '@playwright/test';
import { loginAsDentistViaUi } from '../support/login';

// Camada P. Fundação do web (Tarefa 14): idioma, página pública e guarda do painel.
test.describe('[P] smoke da fundação do web', () => {
  test('[P] "/" mostra o nome da clínica e o html está em pt-BR', async ({ page }) => {
    // Dado um visitante sem sessão
    // Quando abre a página inicial
    await page.goto('/');
    // Então
    await expect(page.getByRole('heading', { name: 'Dra. Eloísa Paiva' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });

  test('[P] "/dashboard" sem sessão redireciona para /login', async ({ page }) => {
    // Dado um visitante sem sessão
    // Quando tenta abrir o painel
    await page.goto('/dashboard');
    // Então
    await expect(page).toHaveURL(/\/login$/);
  });

  test('[P] depois do login a dentista cai em /dashboard/agenda', async ({ page }) => {
    // Dado a dentista do seed
    // Quando faz login pela tela
    await loginAsDentistViaUi(page);
    // Então o /dashboard redireciona para a agenda.
    // Tarefa 17: passa a exigir o título 'Agenda' (a página ainda é 404 aqui; só a URL vale).
    await expect(page).toHaveURL(/\/dashboard\/agenda$/);
  });
});
