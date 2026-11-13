export const CLINIC_TIME_ZONE = 'America/Sao_Paulo';
export const PROCEDURE_DURATIONS = [30, 60, 90] as const; // RN-05
export const DEFAULT_DURATION_MINUTES = 30; // RN-04
export const GRID_STEP_MINUTES = 30; // RN-02
export const MANUAL_STEP_MINUTES = 15;
export const MANUAL_MAX_MINUTES = 480;
export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const NOTES_MAX = 500;
export const REJECTION_MESSAGE_MAX = 500;
export const EMAIL_MAX = 254;
export const PROCEDURE_NAME_MAX = 100;
export const BLOCK_REASON_MAX = 200;
export const AVAILABILITY_MAX_DAYS = 31;
// Faixa de anos de GET /holidays e POST /holiday-overrides (fora dela o desbloqueio ficaria invisível).
export const HOLIDAY_YEAR_MIN = 2000;
export const HOLIDAY_YEAR_MAX = 2100;
// Janela máxima de GET /blocks (from..to, em dias).
export const BLOCKS_LIST_MAX_DAYS = 366;
