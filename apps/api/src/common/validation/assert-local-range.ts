import { DomainError } from '../errors/domain-error';
import { daysBetweenInclusive, type LocalDate } from '../time/clinic-time';

/** `to < from` ou mais de `maxDays` dias (inclusivo) → VALIDATION_FAILED só com nomes de campo. */
export function assertLocalRange(
  from: LocalDate,
  to: LocalDate,
  maxDays: number,
): void {
  const days = daysBetweenInclusive(from, to);
  if (days < 1 || days > maxDays) {
    throw new DomainError('VALIDATION_FAILED', { fields: ['from', 'to'] });
  }
}
