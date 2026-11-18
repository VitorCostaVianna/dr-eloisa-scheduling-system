import { isOccupying } from './statuses';

describe('[RN-13] status ocupantes', () => {
  // CA-1.13: Dado agendamentos CANCELLED, REJECTED ou EXPIRED no horário, então eles
  // não ocupam; dado PENDING, CONFIRMED, COMPLETED ou NO_SHOW, ocupam.
  it.each(['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const)(
    '[CA-1.13] %s ocupa',
    (status) => {
      expect(isOccupying(status)).toBe(true);
    },
  );

  it.each(['CANCELLED', 'REJECTED', 'EXPIRED'] as const)(
    '[CA-1.13] %s não ocupa',
    (status) => {
      expect(isOccupying(status)).toBe(false);
    },
  );
});
