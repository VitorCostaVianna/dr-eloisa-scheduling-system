import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { addDays, todayInClinic, weekStartOf } from '../../src/lib/clinic-time';
import { loginAsDentist } from '../support/login';

// Camada P. Tarefa 16. Datas sempre relativas a hoje (relógio da clínica): o "próximo" feriado
// fixo (MM-DD) é o deste ano se ainda não passou, senão o do ano seguinte.
function nextOccurrence(monthDay: string): string {
  const today = todayInClinic();
  const thisYear = Number(today.slice(0, 4));
  const candidate = `${thisYear}-${monthDay}`;
  return candidate >= today ? candidate : `${thisYear + 1}-${monthDay}`;
}

async function openHolidays(page: Page, date: string) {
  await page.goto(`/dashboard/bloqueios?ano=${date.slice(0, 4)}`);
  return page.getByRole('list', { name: 'Feriados' });
}

test.describe('[P] feriados', () => {
  // CA-1.8: Dado 02/11/2026 (Finados), 20/11/2026, 25/12/2026, 08/12/2026 (Imaculada Conceição,
  // BH) ... o painel mostra cada um como feriado com o nome.
  test('[CA-1.8] o próximo 25/12 aparece como "Natal", 02/11 como "Finados" e 20/11 como "Consciência Negra", feriados', async ({
    page,
  }) => {
    // Dado a dentista logada
    await loginAsDentist(page);

    // Quando abre os feriados do ano do próximo Natal
    const natal = nextOccurrence('12-25');
    const holidays = await openHolidays(page, natal);

    // Então o Natal está na lista, marcado como feriado
    const natalRow = holidays.getByRole('listitem').filter({ hasText: 'Natal' });
    await expect(natalRow).toBeVisible();
    await expect(natalRow).toContainText('25 de dezembro');
    await expect(natalRow).toContainText('feriado');

    // Quando abre os feriados do ano do próximo Finados
    const finadosList = await openHolidays(page, nextOccurrence('11-02'));

    // Então Finados está na lista, marcado como feriado
    const finadosRow = finadosList.getByRole('listitem').filter({ hasText: 'Finados' });
    await expect(finadosRow).toBeVisible();
    await expect(finadosRow).toContainText('2 de novembro');
    await expect(finadosRow).toContainText('feriado');

    // Quando abre os feriados do ano do próximo 20/11
    const consciencia = await openHolidays(page, nextOccurrence('11-20'));

    // Então a Consciência Negra está na lista, marcada como feriado
    const consRow = consciencia.getByRole('listitem').filter({ hasText: 'Consciência Negra' });
    await expect(consRow).toBeVisible();
    await expect(consRow).toContainText('20 de novembro');
    await expect(consRow).toContainText('feriado');
  });

  // CA-1.23: Dado 08/12/2026 (feriado, terça), quando a dentista desbloqueia esse dia, ... o painel
  // mostra o dia como "feriado — atendendo".
  test('[CA-1.23] "Atender neste dia" no próximo 08/12 mostra "feriado — atendendo"; "Voltar a fechar" volta a "fechado"', async ({
    page,
  }) => {
    // Dado a dentista logada e o próximo 08/12 (Imaculada Conceição) fechado
    await loginAsDentist(page);
    const date = nextOccurrence('12-08');
    const holidays = await openHolidays(page, date);
    const row = holidays.getByRole('listitem').filter({ hasText: 'Imaculada Conceição' });
    await expect(row).toBeVisible();
    // Repetível: se uma execução anterior deixou o dia desbloqueado, fecha antes.
    if (await row.getByRole('button', { name: /^Voltar a fechar/ }).count()) {
      await row.getByRole('button', { name: /^Voltar a fechar/ }).click();
    }
    await expect(row.getByText('feriado — fechado')).toBeVisible();

    // Quando desbloqueia o dia
    await row.getByRole('button', { name: /^Atender neste dia/ }).click();

    // Então o painel mostra "feriado — atendendo" e oferece "Voltar a fechar"
    await expect(row.getByText('feriado — atendendo')).toBeVisible();
    await expect(row.getByRole('button', { name: /^Voltar a fechar/ })).toBeVisible();

    // E o estado persiste ao recarregar
    await page.reload();
    await expect(row.getByText('feriado — atendendo')).toBeVisible();

    // Quando volta a fechar
    await row.getByRole('button', { name: /^Voltar a fechar/ }).click();

    // Então
    await expect(row.getByText('feriado — fechado')).toBeVisible();
    await expect(row.getByRole('button', { name: /^Atender neste dia/ })).toBeVisible();
  });
});

test.describe('[P] bloqueios', () => {
  test('[P] cria um bloqueio de dia inteiro, vê na lista e exclui pelo Dialog de confirmação', async ({
    page,
  }) => {
    // Dado a dentista logada e um motivo único, para um dia daqui a 200 dias
    const reason = `Congresso ${randomUUID().slice(0, 8)}`;
    const day = addDays(todayInClinic(), 200);
    await loginAsDentist(page);
    await page.goto('/dashboard/bloqueios');

    // Quando cria o bloqueio de dia inteiro
    await page.getByRole('radio', { name: 'Dia(s) inteiro(s)' }).check();
    await page.getByLabel('De', { exact: true }).fill(day);
    await page.getByLabel('Até', { exact: true }).fill(day);
    await page.getByLabel('Motivo', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Criar bloqueio' }).click();

    // Então aparece na lista
    const item = page
      .getByRole('list', { name: 'Bloqueios' })
      .getByRole('listitem')
      .filter({ hasText: reason });
    await expect(item).toBeVisible();

    // Quando pede para excluir
    await item.getByRole('button', { name: /^Excluir/ }).click();

    // Então pede confirmação, e o bloqueio continua até confirmar
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(item).toBeVisible();

    // Quando confirma
    await item.getByRole('button', { name: /^Excluir/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();

    // Então some da lista
    await expect(item).toHaveCount(0);
  });

  test('[P] cria um bloqueio de período (09:15–09:45) e mostra o horário de Brasília', async ({
    page,
  }) => {
    // Dado a dentista logada e um motivo único, para um dia daqui a 201 dias
    const reason = `Período ${randomUUID().slice(0, 8)}`;
    const day = addDays(todayInClinic(), 201);
    await loginAsDentist(page);
    await page.goto('/dashboard/bloqueios');

    // Quando cria o bloqueio de período
    await page.getByRole('radio', { name: 'Período' }).check();
    await page.getByLabel('Data', { exact: true }).fill(day);
    await page.getByLabel('Início', { exact: true }).fill('09:15');
    await page.getByLabel('Fim', { exact: true }).fill('09:45');
    await page.getByLabel('Motivo', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Criar bloqueio' }).click();

    // Então a lista mostra 09:15 e 09:45 (nunca o UTC)
    const item = page
      .getByRole('list', { name: 'Bloqueios' })
      .getByRole('listitem')
      .filter({ hasText: reason });
    await expect(item).toBeVisible();
    await expect(item).toContainText('09:15');
    await expect(item).toContainText('09:45');
    await expect(item).not.toContainText('12:15');

    // Limpa o estado: exclui o bloqueio
    await item.getByRole('button', { name: /^Excluir/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(item).toHaveCount(0);
  });

  // RN-42: um bloqueio de período pode cruzar a meia-noite (início e fim em dias diferentes).
  test('[RN-42] [P] bloqueio de período de sexta 16:00 a sábado 09:00 aparece na lista com os dois dias e pode ser excluído', async ({
    page,
  }) => {
    // Dado a dentista logada, um motivo único e uma sexta daqui a ~202 dias (e o sábado seguinte)
    const reason = `Plantão ${randomUUID().slice(0, 8)}`;
    const friday = addDays(weekStartOf(addDays(todayInClinic(), 202)), 4);
    const saturday = addDays(friday, 1);
    await loginAsDentist(page);
    await page.goto('/dashboard/bloqueios');

    // Quando cria o período sexta 16:00 -> sábado 09:00 (data de fim alterada para o sábado)
    await page.getByRole('radio', { name: 'Período' }).check();
    await page.getByLabel('Data', { exact: true }).fill(friday);
    await page.getByLabel('Início', { exact: true }).fill('16:00');
    await page.getByLabel('Data de fim', { exact: true }).fill(saturday);
    await page.getByLabel('Fim', { exact: true }).fill('09:00');
    await page.getByLabel('Motivo', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Criar bloqueio' }).click();

    // Então a lista mostra 16:00 e 09:00 (horário de Brasília) cruzando os dois dias
    const item = page
      .getByRole('list', { name: 'Bloqueios' })
      .getByRole('listitem')
      .filter({ hasText: reason });
    await expect(item).toBeVisible();
    await expect(item).toContainText('16:00');
    await expect(item).toContainText('09:00');
    await expect(item).not.toContainText('19:00');
    await expect(item).not.toContainText('12:00');

    // Limpa o estado: exclui o bloqueio
    await item.getByRole('button', { name: /^Excluir/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(item).toHaveCount(0);
  });
});
