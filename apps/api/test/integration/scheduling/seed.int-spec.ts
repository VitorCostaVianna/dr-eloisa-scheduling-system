import { PrismaClient } from '@prisma/client';
import { runSeed, SEED_PROFESSIONAL_NAME } from '../../../prisma/seed-data';
import {
  DEFAULT_WEEKLY_HOURS,
  type WeeklyHoursRow,
} from '../../../src/scheduling/domain/default-working-hours';
import { DENTIST_EMAIL, DENTIST_PASSWORD } from '../../support/factories';
import { truncateAll } from '../../support/db';

const byDayAndStart = (a: WeeklyHoursRow, b: WeeklyHoursRow) =>
  a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute;

describe('[RN-01] horário semanal pré-carregado pelo seed', () => {
  const prisma = new PrismaClient();
  const credentials = { email: DENTIST_EMAIL, password: DENTIST_PASSWORD };

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    // Não deixa linhas para suítes que assumem banco vazio (ex.: truncate-all).
    await truncateAll(prisma);
    await prisma.$disconnect();
  });

  async function storedHours(): Promise<WeeklyHoursRow[]> {
    const rows = await prisma.workingHours.findMany({
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    });
    return rows.sort(byDayAndStart);
  }

  // CA-1.20: Dado o seed rodado duas vezes, então existem exatamente 9 linhas de
  // `WorkingHours` e um `Professional` ligado ao usuário. Dado um horário editado e o seed
  // rodado de novo, então a edição permanece.
  it('[CA-1.20] seed duas vezes → 9 linhas e um Professional ligado ao usuário', async () => {
    // Dado o seed rodado duas vezes
    await runSeed(prisma, credentials);
    await runSeed(prisma, credentials);

    // Então
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: DENTIST_EMAIL },
    });
    expect(await prisma.workingHours.count()).toBe(9);
    expect(await prisma.professional.count()).toBe(1);
    const professional = await prisma.professional.findFirstOrThrow();
    expect(professional.userId).toBe(user.id);
    expect(professional.name).toBe(SEED_PROFESSIONAL_NAME);
    expect(await storedHours()).toEqual(
      [...DEFAULT_WEEKLY_HOURS].sort(byDayAndStart),
    );
  });

  it('[CA-1.20] edição do horário sobrevive a um novo seed', async () => {
    // Dado o seed rodado e a sexta (dia 5) editada de 08:00–10:30 para 08:00–10:00
    await runSeed(prisma, credentials);
    const friday = await prisma.workingHours.findFirstOrThrow({
      where: { dayOfWeek: 5 },
    });
    expect(friday.endMinute).toBe(630);
    await prisma.workingHours.update({
      where: { id: friday.id },
      data: { endMinute: 600 },
    });

    // Quando o seed roda de novo
    await runSeed(prisma, credentials);

    // Então a edição permanece e o total continua 9
    const after = await prisma.workingHours.findUniqueOrThrow({
      where: { id: friday.id },
    });
    expect(after.endMinute).toBe(600);
    expect(await prisma.workingHours.count()).toBe(9);
    expect(await prisma.professional.count()).toBe(1);
  });
});
