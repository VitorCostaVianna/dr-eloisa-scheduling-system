export interface ProcedureDto {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

export interface PublicProcedureDto {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface WorkingHoursDto {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface BlockDto {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  createdAt: string;
}

export type CreateBlockRequest =
  | { kind: 'FULL_DAYS'; fromDate: string; toDate: string; reason?: string }
  | { kind: 'PERIOD'; startAt: string; endAt: string; reason?: string };

export interface HolidayDto {
  date: string;
  name: string;
  overridden: boolean;
}

export interface HolidayOverrideDto {
  id: string;
  date: string;
}

export interface AvailabilityResponse {
  timeZone: string;
  durationMinutes: number;
  days: { date: string; starts: string[] }[];
}

export interface CalendarDayDto {
  date: string;
  dayOfWeek: number;
  workingHours: { startAt: string; endAt: string }[];
  holiday: { name: string; overridden: boolean } | null;
}

/** Só estes status ocupam horário (spec 6.3); o calendário não devolve os demais. Fonte única. */
export const OCCUPYING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
] as const;
export type OccupyingAppointmentStatus = (typeof OCCUPYING_STATUSES)[number];

export interface CalendarAppointmentDto {
  id: string;
  startAt: string;
  endAt: string;
  status: OccupyingAppointmentStatus;
  contactName: string;
  procedureName: string | null;
  onHoliday: boolean;
  outsideWorkingHours: boolean;
}

export interface CalendarResponse {
  timeZone: string;
  days: CalendarDayDto[];
  blocks: BlockDto[];
  appointments: CalendarAppointmentDto[];
}
