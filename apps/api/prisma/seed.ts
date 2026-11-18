import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed-data';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_DENTIST_EMAIL;
  const password = process.env.SEED_DENTIST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_DENTIST_EMAIL e SEED_DENTIST_PASSWORD precisam estar definidas em apps/api/.env',
    );
  }

  await runSeed(prisma, { email, password });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
