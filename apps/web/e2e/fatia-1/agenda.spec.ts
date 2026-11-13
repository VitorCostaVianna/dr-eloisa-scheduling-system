import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addDays,
  clinicLocalToIso,
  formatClinicDate,
  todayInClinic,
  weekStartOf,
} from "../../src/lib/clinic-time";
import {
  deleteAppointmentsByContactName,
  insertAppointment,
} from "../support/db";
import { loginAsDentist } from "../support/login";

// Camada P. Tarefa 17. Datas relativas a hoje (relógio da clínica); agendamentos inseridos
// direto no banco (a fatia 1 não tem tela de marcar) e apagados ao fim de cada teste.
//
// Contratos assumidos para a WeekView (ver relatório):
// - cada agendamento é um elemento com `data-status="<STATUS>"` contendo nome, horário e procedimento;
// - selos são texto visível dentro do agendamento: "em feriado" e "fora do horário";
// - navegação: links "Semana anterior" e "Próxima semana" que trocam `?semana=` para segunda-feira;
// - legenda com o texto "Horários de Brasília";
// - cada coluna de dia é `role="list"` com `aria-labelledby` = id do cabeçalho do dia (a data
//   `YYYY-MM-DD`); agendamentos e bloqueios são `role="listitem"`;
// - cada agendamento tem um texto de status (pode ser sr-only): "pendente de confirmação",
//   "confirmado", "concluído" ou "faltou" (não há rótulos pré-existentes no repositório);
// - selos, nome e procedimento ficam DENTRO da caixa do agendamento (sem corte por overflow),
//   inclusive no agendamento de 30 min (2 linhas da grade) com procedimento.
function nextOccurrence(monthDay: string): string {
  const today = todayInClinic();
  const thisYear = Number(today.slice(0, 4));
  const candidate = `${thisYear}-${monthDay}`;
  return candidate >= today ? candidate : `${thisYear + 1}-${monthDay}`;
}

/** Playwright `toBeVisible` não vê corte por `overflow:hidden`: compara as caixas. */
async function expectInside(inner: Locator, outer: Locator, what: string) {
  await expect(inner, `${what} visível`).toBeVisible();
  const i = await inner.boundingBox();
  const o = await outer.boundingBox();
  expect(i, `${what}: caixa`).not.toBeNull();
  expect(o, "agendamento: caixa").not.toBeNull();
  const tol = 0.5;
  const inside =
    i!.x >= o!.x - tol &&
    i!.y >= o!.y - tol &&
    i!.x + i!.width <= o!.x + o!.width + tol &&
    i!.y + i!.height <= o!.y + o!.height + tol;
  expect(
    inside,
    `${what} dentro da caixa do agendamento (${JSON.stringify(i)} em ${JSON.stringify(o)})`,
  ).toBe(true);
}

async function holidayRow(page: Page, date: string, name: string) {
  await page.goto(`/dashboard/bloqueios?ano=${date.slice(0, 4)}`);
  const row = page
    .getByRole("list", { name: "Feriados" })
    .getByRole("listitem")
    .filter({ hasText: name });
  await expect(row).toBeVisible();
  return row;
}

test.describe("[P] agenda semanal", () => {
  // CA-1.26: Dado 08/12/2026 desbloqueado com um agendamento marcado nele, quando a dentista
  // desfaz o desbloqueio, então o dia volta a não ter inícios livres, o agendamento continua
  // como estava e o painel o destaca como "em feriado".
  test('[CA-1.26] próximo 08/12 desbloqueado com agendamento: "Voltar a fechar" mantém o agendamento, com o selo "em feriado"', async ({
    page,
  }) => {
    const contactName = `Paciente ${randomUUID().slice(0, 8)}`;
    const procedureName = `E2E Limpeza ${randomUUID().slice(0, 8)}`;
    const date = nextOccurrence("12-08");
    try {
      // Dado o 08/12 desbloqueado ("Atender neste dia") e um agendamento 09:00–09:30 (duração padrão, RN-04) com procedimento nele
      await loginAsDentist(page);
      const row = await holidayRow(page, date, "Imaculada Conceição");
      if (await row.getByRole("button", { name: /^Voltar a fechar/ }).count()) {
        await row.getByRole("button", { name: /^Voltar a fechar/ }).click();
        await expect(row.getByText("feriado — fechado")).toBeVisible();
      }
      await row.getByRole("button", { name: /^Atender neste dia/ }).click();
      await expect(row.getByText("feriado — atendendo")).toBeVisible();
      insertAppointment({
        contactName,
        startAt: clinicLocalToIso(date, "09:00"),
        endAt: clinicLocalToIso(date, "09:30"),
        procedureName,
      });

      // Quando a dentista desfaz o desbloqueio
      await row.getByRole("button", { name: /^Voltar a fechar/ }).click();
      await expect(row.getByText("feriado — fechado")).toBeVisible();

      // Então, na semana do 08/12, o agendamento continua como estava, destacado "em feriado"
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(date)}`);
      const appt = page
        .locator("[data-status]")
        .filter({ hasText: contactName });
      await expect(appt).toBeVisible();
      await expect(appt).toHaveAttribute("data-status", "CONFIRMED");
      await expect(appt).toContainText("09:00");
      await expect(appt).toContainText("em feriado");
      await expect(
        page.getByText("Imaculada Conceição — fechado"),
      ).toBeVisible();

      // E o selo é visível de verdade (não cortado), assim como nome e procedimento
      await expectInside(
        appt.getByText("em feriado", { exact: true }),
        appt,
        'selo "em feriado"',
      );
      await expectInside(appt.getByText(contactName), appt, "nome");
      await expectInside(appt.getByText(procedureName), appt, "procedimento");
    } finally {
      deleteAppointmentsByContactName(contactName);
      // Limpa o estado: volta a fechar (igual ao CA-1.23)
      await page.goto(`/dashboard/bloqueios?ano=${date.slice(0, 4)}`);
      const again = page
        .getByRole("list", { name: "Feriados" })
        .getByRole("listitem")
        .filter({ hasText: "Imaculada Conceição" });
      if (
        await again.getByRole("button", { name: /^Voltar a fechar/ }).count()
      ) {
        await again.getByRole("button", { name: /^Voltar a fechar/ }).click();
        await expect(again.getByText("feriado — fechado")).toBeVisible();
      }
    }
  });

  // CA-1.8 (painel): a semana de um feriado mostra o nome no cabeçalho do dia.
  test('[CA-1.8] a semana do próximo 02/11 mostra "Finados — fechado" no cabeçalho do dia', async ({
    page,
  }) => {
    // Dado a dentista logada e o próximo Finados (feriado fechado por padrão)
    await loginAsDentist(page);
    const date = nextOccurrence("11-02");

    // Quando abre a agenda da semana desse dia
    await page.goto(`/dashboard/agenda?semana=${weekStartOf(date)}`);

    // Então o cabeçalho do dia mostra o nome e "fechado"
    await expect(page.getByText("Finados — fechado")).toBeVisible();
  });

  // CA-1.23 (painel): com o feriado desbloqueado o cabeçalho diz "… — atendendo".
  test('[CA-1.23] com o próximo 08/12 desbloqueado, o cabeçalho diz "Imaculada Conceição — atendendo"', async ({
    page,
  }) => {
    const date = nextOccurrence("12-08");
    await loginAsDentist(page);
    const row = await holidayRow(page, date, "Imaculada Conceição");
    if (await row.getByRole("button", { name: /^Voltar a fechar/ }).count()) {
      await row.getByRole("button", { name: /^Voltar a fechar/ }).click();
      await expect(row.getByText("feriado — fechado")).toBeVisible();
    }
    try {
      // Dado o feriado desbloqueado
      await row.getByRole("button", { name: /^Atender neste dia/ }).click();
      await expect(row.getByText("feriado — atendendo")).toBeVisible();

      // Quando abre a agenda da semana
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(date)}`);

      // Então
      await expect(
        page.getByText("Imaculada Conceição — atendendo"),
      ).toBeVisible();
      await expect(page.getByText("Imaculada Conceição — fechado")).toHaveCount(
        0,
      );
    } finally {
      // Limpa o estado: volta a fechar
      await page.goto(`/dashboard/bloqueios?ano=${date.slice(0, 4)}`);
      const again = page
        .getByRole("list", { name: "Feriados" })
        .getByRole("listitem")
        .filter({ hasText: "Imaculada Conceição" });
      if (
        await again.getByRole("button", { name: /^Voltar a fechar/ }).count()
      ) {
        await again.getByRole("button", { name: /^Voltar a fechar/ }).click();
        await expect(again.getByText("feriado — fechado")).toBeVisible();
      }
    }
  });

  test('[P] navega para a semana anterior e a próxima, e mostra a legenda "Horários de Brasília"', async ({
    page,
  }) => {
    // Dado a agenda de uma semana qualquer (daqui a ~60 dias)
    const monday = weekStartOf(addDays(todayInClinic(), 60));
    await loginAsDentist(page);
    await page.goto(`/dashboard/agenda?semana=${monday}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeVisible();
    await expect(page.getByText("Horários de Brasília")).toBeVisible();

    // Quando vai para a próxima semana
    await page.getByRole("link", { name: /Próxima semana/ }).click();
    // Então
    await expect(page).toHaveURL(new RegExp(`semana=${addDays(monday, 7)}`));

    // Quando volta duas vezes (semana anterior)
    await page.getByRole("link", { name: /Semana anterior/ }).click();
    await expect(page).toHaveURL(new RegExp(`semana=${monday}`));
    await page.getByRole("link", { name: /Semana anterior/ }).click();
    // Então
    await expect(page).toHaveURL(new RegExp(`semana=${addDays(monday, -7)}`));
  });

  test('[P] agendamento PENDING tem borda tracejada; fora do horário recebe o selo "fora do horário"', async ({
    page,
  }) => {
    // Dado uma quarta-feira daqui a ~90 dias, com um PENDING às 18:00 (depois do expediente)
    // e um CONFIRMED às 09:00 (dentro do expediente de quarta)
    const wednesday = addDays(weekStartOf(addDays(todayInClinic(), 90)), 2);
    const pendingName = `Pendente ${randomUUID().slice(0, 8)}`;
    const confirmedName = `Confirmado ${randomUUID().slice(0, 8)}`;
    try {
      insertAppointment({
        contactName: pendingName,
        startAt: clinicLocalToIso(wednesday, "18:00"),
        endAt: clinicLocalToIso(wednesday, "18:30"),
        status: "PENDING",
      });
      insertAppointment({
        contactName: confirmedName,
        startAt: clinicLocalToIso(wednesday, "09:00"),
        endAt: clinicLocalToIso(wednesday, "09:30"),
      });
      await loginAsDentist(page);

      // Quando abre a semana
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(wednesday)}`);

      // Então o PENDING é tracejado e tem o selo; o CONFIRMED é sólido e não tem o selo
      const pending = page
        .locator('[data-status="PENDING"]')
        .filter({ hasText: pendingName });
      await expect(pending).toBeVisible();
      await expect(pending).toHaveCSS("border-top-style", "dashed");
      await expect(pending).toContainText("18:00");
      await expect(pending).toContainText("fora do horário");

      const confirmed = page
        .locator('[data-status="CONFIRMED"]')
        .filter({ hasText: confirmedName });
      await expect(confirmed).toBeVisible();
      await expect(confirmed).not.toHaveCSS("border-top-style", "dashed");
      await expect(confirmed).toContainText("09:00");
      await expect(confirmed).not.toContainText("fora do horário");
    } finally {
      deleteAppointmentsByContactName(pendingName);
      deleteAppointmentsByContactName(confirmedName);
    }
  });

  test("[P] PENDING de 30 min com procedimento fora do horário: selo, nome e procedimento dentro da caixa", async ({
    page,
  }) => {
    // Dado uma quarta-feira daqui a ~100 dias e um PENDING 18:00–18:30 (depois do expediente) com procedimento
    const wednesday = addDays(weekStartOf(addDays(todayInClinic(), 100)), 2);
    const contactName = `Pendente ${randomUUID().slice(0, 8)}`;
    const procedureName = `E2E Canal ${randomUUID().slice(0, 8)}`;
    try {
      insertAppointment({
        contactName,
        startAt: clinicLocalToIso(wednesday, "18:00"),
        endAt: clinicLocalToIso(wednesday, "18:30"),
        status: "PENDING",
        procedureName,
      });
      await loginAsDentist(page);

      // Quando abre a semana
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(wednesday)}`);

      // Então
      const appt = page
        .locator('[data-status="PENDING"]')
        .filter({ hasText: contactName });
      await expect(appt).toBeVisible();
      await expectInside(
        appt.getByText("fora do horário", { exact: true }),
        appt,
        "selo",
      );
      await expectInside(appt.getByText(contactName), appt, "nome");
      await expectInside(appt.getByText(procedureName), appt, "procedimento");
    } finally {
      deleteAppointmentsByContactName(contactName);
    }
  });

  // I1 (WCAG 1.4.1): o status não pode depender só de cor/borda.
  test("[P] cada agendamento tem texto de status acessível (pendente, confirmado, concluído, faltou)", async ({
    page,
  }) => {
    // Dado quatro agendamentos, um por status, numa terça-feira daqui a ~110 dias
    const tuesday = addDays(weekStartOf(addDays(todayInClinic(), 110)), 1);
    const labels = {
      PENDING: "pendente de confirmação",
      CONFIRMED: "confirmado",
      COMPLETED: "concluído",
      NO_SHOW: "faltou",
    } as const;
    const statuses = Object.keys(labels) as (keyof typeof labels)[];
    const tag = randomUUID().slice(0, 8);
    const names = statuses.map((st) => `${st} ${tag}`);
    try {
      statuses.forEach((st, i) => {
        const hour = String(9 + i).padStart(2, "0");
        insertAppointment({
          contactName: names[i],
          startAt: clinicLocalToIso(tuesday, `${hour}:00`),
          endAt: clinicLocalToIso(tuesday, `${hour}:30`),
          status: st,
        });
      });
      await loginAsDentist(page);

      // Quando abre a semana
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(tuesday)}`);

      // Então cada um tem o seu texto de status
      for (const [i, st] of statuses.entries()) {
        const appt = page
          .locator(`[data-status="${st}"]`)
          .filter({ hasText: names[i] });
        await expect(appt).toHaveCount(1);
        await expect(appt.getByText(labels[st], { exact: true })).toHaveCount(
          1,
        );
      }
    } finally {
      names.forEach(deleteAppointmentsByContactName);
    }
  });

  // I2: semântica das colunas.
  test("[P] a coluna do dia é uma lista nomeada pelo cabeçalho do dia (id = data) e contém o agendamento com procedimento", async ({
    page,
  }) => {
    // Dado um CONFIRMED 10:00–10:30 com procedimento numa quinta-feira daqui a ~120 dias
    const thursday = addDays(weekStartOf(addDays(todayInClinic(), 120)), 3);
    const contactName = `Lista ${randomUUID().slice(0, 8)}`;
    const procedureName = `E2E Restauração ${randomUUID().slice(0, 8)}`;
    try {
      insertAppointment({
        contactName,
        startAt: clinicLocalToIso(thursday, "10:00"),
        endAt: clinicLocalToIso(thursday, "10:30"),
        procedureName,
      });
      await loginAsDentist(page);

      // Quando abre a semana
      await page.goto(`/dashboard/agenda?semana=${weekStartOf(thursday)}`);

      // Então o cabeçalho tem id = a data, e a lista que ele nomeia contém o item
      await expect(page.locator(`[id="${thursday}"]`)).toContainText(
        formatClinicDate(thursday),
      );
      const column = page.getByRole("list", {
        name: formatClinicDate(thursday),
      });
      await expect(column).toHaveCount(1);
      const item = column
        .getByRole("listitem")
        .filter({ hasText: contactName });
      await expect(item).toHaveCount(1);
      await expect(item).toHaveAttribute("data-status", "CONFIRMED");
      await expect(item.getByText(procedureName)).toBeVisible();
      // Sem PII em atributos aria-*
      await expect(page.locator(`[aria-label*="${contactName}"]`)).toHaveCount(
        0,
      );
      await expect(
        page.locator(`[aria-labelledby*="${contactName}"]`),
      ).toHaveCount(0);
    } finally {
      deleteAppointmentsByContactName(contactName);
    }
  });
});
