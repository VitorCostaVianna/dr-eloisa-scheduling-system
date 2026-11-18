import { Prisma, PrismaClient } from '@prisma/client';
import { truncateAll } from '../../support/db';
import { clinicInstant } from '../../support/clock';
import {
  isOccupying,
  type AppointmentStatusName,
} from '../../../src/scheduling/domain/statuses';

const ALL_STATUSES: AppointmentStatusName[] = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
];

describe('[RN-13] constraints do schema da agenda', () => {
  const prisma = new PrismaClient();
  let professionalId: string;
  let patientId: string;

  beforeEach(async () => {
    await truncateAll(prisma);
    // Dado um profissional e um paciente
    professionalId = (
      await prisma.professional.create({ data: { name: 'Dra. Eloísa' } })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: { name: 'Paciente', phone: '+5531999990000' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const appointment = (
    status: AppointmentStatusName,
    startAt: Date,
    endAt: Date,
  ) => ({
    professionalId,
    patientId,
    source: 'DENTIST' as const,
    contactName: 'Paciente',
    status,
    startAt,
    endAt,
  });

  // CA-1.13: Dado agendamentos CANCELLED, REJECTED ou EXPIRED no horário, então eles
  // não ocupam; dado PENDING, CONFIRMED, COMPLETED ou NO_SHOW, ocupam.
  it.each(ALL_STATUSES)(
    '[CA-1.13] B %s sobreposto a A CONFIRMED conforme isOccupying',
    async (status) => {
      // Dado A CONFIRMED 09:00–10:00 em segunda 09/11
      await prisma.appointment.create({
        data: appointment(
          'CONFIRMED',
          clinicInstant('2026-11-09 09:00'),
          clinicInstant('2026-11-09 10:00'),
        ),
      });
      // Quando B (status da vez) 09:30–10:30
      const insertB = prisma.appointment.create({
        data: appointment(
          status,
          clinicInstant('2026-11-09 09:30'),
          clinicInstant('2026-11-09 10:30'),
        ),
      });
      // Então ocupante é rejeitado pela exclusion constraint; não ocupante grava
      if (isOccupying(status)) {
        const err: Error = await insertB.then(
          () => {
            throw new Error('esperava rejeição');
          },
          (e: Error) => e,
        );
        expect(err.constructor.name).toBe('PrismaClientUnknownRequestError');
        expect(err.message).toContain('no_overlapping_appointments');
        expect(await prisma.appointment.count()).toBe(1);
      } else {
        await expect(insertB).resolves.toBeDefined();
        expect(await prisma.appointment.count()).toBe(2);
      }
    },
  );

  it('CHECK: Appointment com startAt = endAt é rejeitado', async () => {
    const t = clinicInstant('2026-11-09 09:00');
    await expect(
      prisma.appointment.create({ data: appointment('PENDING', t, t) }),
    ).rejects.toThrow(/appointment_start_before_end/);
  });

  it('CHECK: ScheduleBlock com startAt = endAt é rejeitado', async () => {
    const t = clinicInstant('2026-11-09 09:00');
    await expect(
      prisma.scheduleBlock.create({
        data: { professionalId, startAt: t, endAt: t },
      }),
    ).rejects.toThrow(/schedule_block_start_before_end/);
  });

  it('CHECK: WorkingHours com endMinute = 1441 é rejeitado', async () => {
    await expect(
      prisma.workingHours.create({
        data: {
          professionalId,
          dayOfWeek: 1,
          startMinute: 480,
          endMinute: 1441,
        },
      }),
    ).rejects.toThrow(/working_hours_valid_range/);
  });

  it('índice único: dois Service ativos "Limpeza" e "limpeza" (forma do erro)', async () => {
    // Dado "Limpeza" ativo
    await prisma.service.create({
      data: { name: 'Limpeza', durationMinutes: 30, active: true },
    });
    // Quando "limpeza" ativo
    const err = await prisma.service
      .create({ data: { name: 'limpeza', durationMinutes: 30, active: true } })
      .then(
        () => {
          throw new Error('esperava rejeição');
        },
        (e: unknown) => e,
      );
    // Então a forma real que a Tarefa 9 mapeia para PROCEDURE_NAME_TAKEN
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const known = err as Prisma.PrismaClientKnownRequestError;
    expect(known.constructor.name).toBe('PrismaClientKnownRequestError');
    expect(known.code).toBe('P2002');
    expect(known.meta).toEqual({
      modelName: 'Service',
      target: ['lower(name)'],
    });
    expect(await prisma.service.count()).toBe(1);
  });

  it('índice único parcial: Service inativo com o mesmo nome grava', async () => {
    await prisma.service.create({
      data: { name: 'Limpeza', durationMinutes: 30, active: true },
    });
    await expect(
      prisma.service.create({
        data: { name: 'limpeza', durationMinutes: 30, active: false },
      }),
    ).resolves.toBeDefined();
    expect(await prisma.service.count()).toBe(2);
  });

  it('HolidayOverride duplicado (professionalId, date) dá P2002', async () => {
    const date = new Date(Date.UTC(2026, 10, 20));
    await prisma.holidayOverride.create({ data: { professionalId, date } });
    const err = await prisma.holidayOverride
      .create({ data: { professionalId, date } })
      .then(
        () => {
          throw new Error('esperava rejeição');
        },
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });
});
