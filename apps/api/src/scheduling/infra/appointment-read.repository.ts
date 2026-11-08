import { Injectable } from '@nestjs/common';
import type { OccupyingAppointmentStatus } from '@sistema-agendamento/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { OCCUPYING_STATUSES, isOccupyingStatus } from '../domain/statuses';

export interface AppointmentReadRecord {
  id: string;
  startAt: Date;
  endAt: Date;
  status: OccupyingAppointmentStatus;
  contactName: string;
  procedureName: string | null;
}

@Injectable()
export class AppointmentReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Agendamentos em OCCUPYING_STATUSES que intersectam [from, to), por startAt. */
  async findOccupyingIntersecting(
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<AppointmentReadRecord[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: [...OCCUPYING_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        contactName: true,
        service: { select: { name: true } },
      },
    });
    return rows.flatMap((r) =>
      isOccupyingStatus(r.status)
        ? [
            {
              id: r.id,
              startAt: r.startAt,
              endAt: r.endAt,
              status: r.status,
              contactName: r.contactName,
              procedureName: r.service?.name ?? null,
            },
          ]
        : [],
    );
  }
}
