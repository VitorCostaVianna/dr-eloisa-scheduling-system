import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_WEEKLY_HOURS } from '../src/scheduling/domain/default-working-hours';

export const SEED_PROFESSIONAL_NAME = 'Dra. Eloísa Paiva';

// Idempotente: rodar de novo não duplica nada e preserva horários editados pela dentista.
// Sem procedimentos: a lista da cliente segue em aberto (spec 12.1).
export async function runSeed(
  prisma: PrismaClient,
  env: { email: string; password: string },
): Promise<void> {
  const passwordHash = await argon2.hash(env.password);

  const user = await prisma.user.upsert({
    where: { email: env.email },
    update: { passwordHash },
    create: { email: env.email, passwordHash, role: 'DENTIST' },
  });

  const professional = await prisma.professional.upsert({
    where: { userId: user.id },
    update: {},
    create: { name: SEED_PROFESSIONAL_NAME, userId: user.id },
  });

  // Só pré-carrega o horário se não houver nenhum: uma edição não pode ser desfeita pelo seed.
  const existing = await prisma.workingHours.count({
    where: { professionalId: professional.id },
  });
  if (existing === 0) {
    await prisma.workingHours.createMany({
      data: DEFAULT_WEEKLY_HOURS.map((row) => ({
        professionalId: professional.id,
        ...row,
      })),
    });
  }

  console.log(`Usuária seedada (id ${user.id})`);
}
