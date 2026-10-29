import { PrismaService } from '../../../src/prisma/prisma.service';
import { ProfessionalContextService } from '../../../src/scheduling/application/professional-context.service';
import { createTestApp, type TestApp } from '../../support/app';
import { truncateAll } from '../../support/db';
import { seedProfessional } from '../../support/factories';

describe('ProfessionalContextService', () => {
  let ctx: TestApp;
  let prisma: PrismaService;
  let service: ProfessionalContextService;

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    service = ctx.app.get(ProfessionalContextService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    // Não deixa linhas para suítes que assumem banco vazio (ex.: truncate-all).
    await truncateAll(prisma);
    await ctx.app.close();
  });

  async function dentistWithProfessional(email: string): Promise<{
    userId: string;
    professionalId: string;
  }> {
    const user = await prisma.user.create({
      data: { email, passwordHash: 'hash-de-teste', role: 'DENTIST' },
    });
    const professional = await prisma.professional.create({
      data: { name: 'Profissional', userId: user.id },
    });
    return { userId: user.id, professionalId: professional.id };
  }

  it('forUser devolve o id da Professional ligada ao usuário', async () => {
    // Dado
    const { userId, professionalId } = await seedProfessional(prisma);
    // Quando / Então
    await expect(service.forUser(userId)).resolves.toBe(professionalId);
  });

  it('forUser rejeita para usuário sem Professional', async () => {
    // Dado um usuário sem Professional
    const user = await prisma.user.create({
      data: { email: 'staff@example.com', passwordHash: 'x', role: 'STAFF' },
    });
    // Quando / Então
    await expect(service.forUser(user.id)).rejects.toThrow();
  });

  it('forPublic devolve a única Professional ligada a um User DENTIST', async () => {
    // Dado
    const { professionalId } = await dentistWithProfessional('a@example.com');
    // Quando / Então
    await expect(service.forPublic()).resolves.toBe(professionalId);
  });

  it('forPublic rejeita quando não há Professional', async () => {
    expect(await prisma.professional.count()).toBe(0);
    await expect(service.forPublic()).rejects.toThrow();
  });

  it('forPublic rejeita quando há duas Professionals ligadas a DENTIST', async () => {
    // Dado
    await dentistWithProfessional('a@example.com');
    await dentistWithProfessional('b@example.com');
    // Quando / Então
    await expect(service.forPublic()).rejects.toThrow();
  });
});
