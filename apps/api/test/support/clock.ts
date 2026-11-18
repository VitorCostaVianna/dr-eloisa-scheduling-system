import type { Clock } from '../../src/common/time/clock';
import { CLINIC_TIME_ZONE, instantAt } from '../../src/common/time/clinic-time';

export class FixedClock implements Clock {
  current: Date;

  constructor(initial: Date) {
    this.current = initial;
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

/** 'YYYY-MM-DD HH:mm' no fuso da clínica → instante (luxon só em clinic-time.ts). */
export function clinicInstant(
  local: string,
  tz: string = CLINIC_TIME_ZONE,
): Date {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Invalid clinic instant: ${local}`);
  return instantAt(m[1], Number(m[2]) * 60 + Number(m[3]), tz);
}

export const BASE_NOW = clinicInstant('2026-11-01 12:00');
