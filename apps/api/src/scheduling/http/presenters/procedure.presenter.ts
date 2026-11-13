import type {
  ProcedureDto,
  PublicProcedureDto,
} from '@sistema-agendamento/shared-types';

interface ProcedureRow {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

export function toProcedureDto(row: ProcedureRow): ProcedureDto {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
    active: row.active,
  };
}

export function toPublicProcedureDto(row: ProcedureRow): PublicProcedureDto {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
  };
}
