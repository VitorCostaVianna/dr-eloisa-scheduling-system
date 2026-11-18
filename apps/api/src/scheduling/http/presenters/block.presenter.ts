import type { BlockDto } from '@sistema-agendamento/shared-types';

export interface BlockRow {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  createdAt: Date;
}

export function toBlockDto(row: BlockRow): BlockDto {
  return {
    id: row.id,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}
