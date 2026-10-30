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
