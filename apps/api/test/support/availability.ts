import {
  CLINIC_TIME_ZONE,
  localMinuteOf,
} from '../../src/common/time/clinic-time';
import type { AvailabilityInput } from '../../src/scheduling/domain/availability';
import { DEFAULT_WEEKLY_HOURS } from '../../src/scheduling/domain/default-working-hours';
import { BASE_NOW } from './clock';

export const RN01_HOURS = DEFAULT_WEEKLY_HOURS;

/** `fromDate`/`toDate` são obrigatórios no uso; o resto tem padrão. */
export function availabilityInput(
  o: Partial<AvailabilityInput>,
): AvailabilityInput {
  if (!o.fromDate || !o.toDate) {
    throw new Error('availabilityInput: fromDate e toDate são obrigatórios');
  }
  return {
    weeklyHours: RN01_HOURS,
    blocks: [],
    occupied: [],
    holidays: new Map(),
    holidayOverrides: new Set(),
    durationMinutes: 30,
    now: BASE_NOW,
    timeZone: CLINIC_TIME_ZONE,
    ...o,
    fromDate: o.fromDate,
    toDate: o.toDate,
  };
}

/** 'HH:mm' no fuso (padrão: clínica). */
export function toClinicHHmm(d: Date, tz: string = CLINIC_TIME_ZONE): string {
  const m = localMinuteOf(d, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
