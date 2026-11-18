import type {
  AppointmentSource,
  AppointmentStatus,
  PrismaClient,
} from '@prisma/client';
import { runSeed } from '../../prisma/seed-data';
import {
  localDateToDbDate,
  type LocalDate,
} from '../../src/common/time/clinic-time';

// Mesmos valores do .env.test; o fallback evita depender da ordem de carga do ambiente.
export const DENTIST_EMAIL =
  process.env.SEED_DENTIST_EMAIL ?? 'dentista@example.com';
export const DENTIST_PASSWORD =
  process.env.SEED_DENTIST_PASSWORD ?? 'mude-esta-senha-123';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedProfessional(
  prisma: PrismaClient,
): Promise<{ userId: string; professionalId: string }> {
  await runSeed(prisma, { email: DENTIST_EMAIL, password: DENTIST_PASSWORD });
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: DENTIST_EMAIL },
    include: { professional: true },
  });
  if (!user.professional) {
    throw new Error('seedProfessional: o seed não criou o Professional');
  }
  return { userId: user.id, professionalId: user.professional.id };
}

export async function makeService(
  prisma: PrismaClient,
  p: {
    professionalId: string;
    name?: string;
    durationMinutes?: number;
    active?: boolean;
  },
): Promise<{ id: string }> {
  return prisma.service.create({
    data: {
      name: p.name ?? `Procedimento ${Math.random().toString(36).slice(2, 8)}`,
      durationMinutes: p.durationMinutes ?? 30,
      active: p.active ?? true,
      professionals: { connect: { id: p.professionalId } },
    },
    select: { id: true },
  });
}

export async function makePatient(
  prisma: PrismaClient,
  p: { phone?: string; name?: string } = {},
): Promise<{ id: string }> {
  const suffix = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return prisma.patient.create({
    data: {
      name: p.name ?? 'Paciente Teste',
      phone: p.phone ?? `+55319${suffix}`,
    },
    select: { id: true },
  });
}

export async function makeAppointment(
  prisma: PrismaClient,
  p: {
    professionalId: string;
    startAt: Date;
    durationMinutes?: number;
    status?: AppointmentStatus;
    serviceId?: string | null;
    createdAt?: Date;
    closedAt?: Date | null;
    source?: AppointmentSource;
    contactName?: string;
    contactEmail?: string | null;
  },
): Promise<{ id: string }> {
  const patient = await makePatient(prisma);
  const durationMinutes = p.durationMinutes ?? 30;
  return prisma.appointment.create({
    data: {
      professionalId: p.professionalId,
      patientId: patient.id,
      serviceId: p.serviceId ?? null,
      source: p.source ?? 'DENTIST',
      contactName: p.contactName ?? 'Paciente Teste',
      contactEmail: p.contactEmail ?? null,
      startAt: p.startAt,
      endAt: new Date(p.startAt.getTime() + durationMinutes * 60_000),
      status: p.status ?? 'CONFIRMED',
      createdAt: p.createdAt ?? new Date(p.startAt.getTime() - DAY_MS),
      closedAt: p.closedAt ?? null,
    },
    select: { id: true },
  });
}

export async function makeBlock(
  prisma: PrismaClient,
  p: { professionalId: string; startAt: Date; endAt: Date; reason?: string },
): Promise<{ id: string }> {
  return prisma.scheduleBlock.create({
    data: {
      professionalId: p.professionalId,
      startAt: p.startAt,
      endAt: p.endAt,
      reason: p.reason ?? null,
    },
    select: { id: true },
  });
}

export async function makeHolidayOverride(
  prisma: PrismaClient,
  p: { professionalId: string; date: LocalDate },
): Promise<{ id: string }> {
  return prisma.holidayOverride.create({
    data: {
      professionalId: p.professionalId,
      date: localDateToDbDate(p.date),
    },
    select: { id: true },
  });
}
