import { OCCUPYING_STATUSES } from '@sistema-agendamento/shared-types';

// Espelha o predicado da exclusion constraint no_overlapping_appointments (spec 6.3):
// quem não está em NON_OCCUPYING_STATUSES ocupa o horário. Se um mudar, o outro muda
// na mesma migration; o teste de integração (CA-1.13) prova que batem.
export const NON_OCCUPYING_STATUSES = [
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const;
export { OCCUPYING_STATUSES };

export type AppointmentStatusName =
  (typeof OCCUPYING_STATUSES)[number] | (typeof NON_OCCUPYING_STATUSES)[number];

export function isOccupyingStatus(
  status: string,
): status is (typeof OCCUPYING_STATUSES)[number] {
  return (OCCUPYING_STATUSES as readonly string[]).includes(status);
}

export function isOccupying(status: AppointmentStatusName): boolean {
  return !(NON_OCCUPYING_STATUSES as readonly string[]).includes(status);
}
