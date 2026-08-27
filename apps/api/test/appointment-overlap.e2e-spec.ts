import { config } from 'dotenv';
import { resolve } from 'path';

// jest não sabe nada sobre .env — precisa carregar manualmente ANTES de instanciar o
// PrismaClient (ele lê DATABASE_URL de process.env no momento da construção).
// Apontamos pro banco de TESTE (agendamento_test), nunca pro de desenvolvimento.
config({ path: resolve(__dirname, '../.env.test') });

import { PrismaClient } from '@prisma/client';

describe('Appointment overlap prevention (exclusion constraint)', () => {
  const prisma = new PrismaClient();
  let professionalId: string;
  let serviceId: string;
  let patientId: string;

  beforeAll(async () => {
    const professional = await prisma.professional.create({
      data: { name: 'Profissional de Teste' },
    });
    professionalId = professional.id;

    const service = await prisma.service.create({
      data: { name: 'Serviço de Teste', durationMinutes: 60 },
    });
    serviceId = service.id;

    const patient = await prisma.patient.create({
      data: { name: 'Paciente de Teste', phone: 'test-overlap-phone' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    // Appointment tem FK com onDelete: RESTRICT (padrão do Prisma pra relação
    // obrigatória) pra professionalId/serviceId/patientId — o Postgres recusa apagar
    // um Professional enquanto existir Appointment apontando pra ele. Por isso os
    // appointments têm que sumir primeiro.
    await prisma.appointment.deleteMany({ where: { professionalId } });
    await prisma.professional.delete({ where: { id: professionalId } });
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.patient.delete({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it('rejects two overlapping appointments for the same professional created concurrently', async () => {
    // Duas Promises criadas SEM await individual — cada .create() já dispara a query
    // pro Postgres assim que é chamado, então as duas ficam "em voo" ao mesmo tempo.
    // Se desse await em cada uma antes de criar a próxima, seria sequencial, não
    // concorrente, e a segunda chamada lançaria antes de chegar no allSettled.
    const promise1 = prisma.appointment.create({
      data: {
        startAt: new Date('2026-09-01T14:00:00Z'),
        endAt: new Date('2026-09-01T15:00:00Z'),
        professionalId,
        serviceId,
        patientId,
      },
    });

    const promise2 = prisma.appointment.create({
      data: {
        startAt: new Date('2026-09-01T14:30:00Z'),
        endAt: new Date('2026-09-01T15:30:00Z'),
        professionalId,
        serviceId,
        patientId,
      },
    });

    const results = await Promise.allSettled([promise1, promise2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // A exclusion constraint NÃO é um erro "conhecido" do Prisma (diferente de
    // unique/FK, que viram PrismaClientKnownRequestError com código P2002/P2003) —
    // cai como PrismaClientUnknownRequestError, sem .code estruturado. O detalhe real
    // (23P01, nome da constraint) só existe dentro de .message como texto puro.
    // Confirmado rodando o teste com console.log antes de escrever esta asserção —
    // nunca adivinhar a forma de um erro de biblioteca externa.
    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason.constructor.name).toBe('PrismaClientUnknownRequestError');
    expect(rejection.reason.message).toContain('no_overlapping_appointments');
    expect(rejection.reason.message).toContain('23P01');
  });

  it('accepts two non-overlapping appointments for the same professional', async () => {
    const promise1 = prisma.appointment.create({
      data: {
        startAt: new Date('2026-09-02T09:00:00Z'),
        endAt: new Date('2026-09-02T10:00:00Z'),
        professionalId,
        serviceId,
        patientId,
      },
    });

    const promise2 = prisma.appointment.create({
      data: {
        startAt: new Date('2026-09-02T10:00:00Z'),
        endAt: new Date('2026-09-02T11:00:00Z'),
        professionalId,
        serviceId,
        patientId,
      },
    });

    const results = await Promise.allSettled([promise1, promise2]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });
});
