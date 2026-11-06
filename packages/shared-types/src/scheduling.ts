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
