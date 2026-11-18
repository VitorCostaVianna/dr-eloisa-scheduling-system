import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";

export const API_DIR = resolve(__dirname, "../../../api");

/** Variáveis do `.env.test` da API (banco `agendamento_test`, credenciais do seed). */
export function loadApiTestEnv(): Record<string, string> {
  const parsed = parseEnv(readFileSync(resolve(API_DIR, ".env.test"), "utf8"));
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

/** Recusa qualquer banco cujo nome não termine em `_test` (nunca truncar o de dev). */
export function assertTestDatabaseUrl(url: string | undefined): void {
  let dbName = "";
  try {
    dbName = new URL(url ?? "").pathname.replace(/^\//, "");
  } catch {
    // cai na recusa abaixo
  }
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `DATABASE_URL do e2e precisa apontar para um banco terminado em "_test" (recebido: "${dbName || "inválida/ausente"}").`,
    );
  }
}

function run(cmd: string, args: string[], env: Record<string, string>): void {
  execFileSync(cmd, args, {
    cwd: API_DIR,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
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
  execFileSync(process.execPath, ["-e", TRUNCATE_SCRIPT], {
    cwd: API_DIR,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

export function migrateDeploy(env: Record<string, string>): void {
  assertTestDatabaseUrl(env.DATABASE_URL);
  run("pnpm", ["exec", "prisma", "migrate", "deploy"], env);
}

export function seed(env: Record<string, string>): void {
  assertTestDatabaseUrl(env.DATABASE_URL);
  run("pnpm", ["exec", "prisma", "db", "seed"], env);
}

// Insere um agendamento direto no banco (a fatia 1 não tem tela de marcar). Roda dentro do
// apps/api, como o truncate. Parâmetros por variável de ambiente (nada interpolado no script).
const INSERT_APPOINTMENT_SCRIPT = `
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const a = JSON.parse(process.env.E2E_APPOINTMENT);
    const professional = await prisma.professional.findFirstOrThrow();
    // O seed não tem procedimentos: cria um Service de teste (prefixo "E2E ", apagado na limpeza).
    const service = a.procedureName
      ? await prisma.service.create({ data: { name: a.procedureName, durationMinutes: 30 } })
      : null;
    const patient = await prisma.patient.upsert({
      where: { phone: a.phone },
      update: {},
      create: { name: a.contactName, phone: a.phone },
    });
    await prisma.appointment.create({
      data: {
        professionalId: professional.id,
        patientId: patient.id,
        serviceId: service ? service.id : null,
        source: 'DENTIST',
        contactName: a.contactName,
        startAt: new Date(a.startAt),
        endAt: new Date(a.endAt),
        status: a.status,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
`;

const DELETE_APPOINTMENTS_SCRIPT = `
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const appts = await prisma.appointment.findMany({
      where: { contactName: process.env.E2E_CONTACT_NAME },
      select: { patientId: true, serviceId: true },
    });
    await prisma.appointment.deleteMany({ where: { contactName: process.env.E2E_CONTACT_NAME } });
    const patientIds = [...new Set(appts.map((x) => x.patientId).filter(Boolean))];
    const serviceIds = [...new Set(appts.map((x) => x.serviceId).filter(Boolean))];
    // Só apaga o que ficou órfão e o que é de teste (nunca um procedimento do seed).
    await prisma.patient.deleteMany({ where: { id: { in: patientIds }, appointments: { none: {} } } });
    await prisma.service.deleteMany({
      where: { id: { in: serviceIds }, name: { startsWith: 'E2E ' }, appointments: { none: {} } },
    });
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
`;

export interface TestAppointment {
  /** Único por teste: é a chave da limpeza. */
  contactName: string;
  /** Instantes ISO UTC (use `clinicLocalToIso`). */
  startAt: string;
  endAt: string;
  /** Se informado, cria um Service de teste com esse nome (use o prefixo "E2E "). */
  procedureName?: string;
  status?: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW";
}

/** Cria um agendamento (e o paciente) do dentista do seed no banco de teste. */
export function insertAppointment(appt: TestAppointment): void {
  const env = loadApiTestEnv();
  assertTestDatabaseUrl(env.DATABASE_URL);
  const phone = `+5531${String(Math.floor(Math.random() * 1e9)).padStart(9, "9")}`;
  execFileSync(process.execPath, ["-e", INSERT_APPOINTMENT_SCRIPT], {
    cwd: API_DIR,
    env: {
      ...process.env,
      ...env,
      E2E_APPOINTMENT: JSON.stringify({ status: "CONFIRMED", ...appt, phone }),
    },
    stdio: "inherit",
  });
}

/** Apaga os agendamentos criados por `insertAppointment` com esse nome, o paciente e o procedimento de teste. */
export function deleteAppointmentsByContactName(contactName: string): void {
  const env = loadApiTestEnv();
  assertTestDatabaseUrl(env.DATABASE_URL);
  execFileSync(process.execPath, ["-e", DELETE_APPOINTMENTS_SCRIPT], {
    cwd: API_DIR,
    env: { ...process.env, ...env, E2E_CONTACT_NAME: contactName },
    stdio: "inherit",
  });
}
