import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_DENTIST_EMAIL;
  const password = process.env.SEED_DENTIST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_DENTIST_EMAIL e SEED_DENTIST_PASSWORD precisam estar definidas em apps/api/.env',
    );
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, role: 'DENTIST' },
  });

  console.log(`Usuária seedada: ${user.email} (id ${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
