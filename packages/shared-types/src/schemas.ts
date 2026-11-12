import { z } from 'zod';
import { PROCEDURE_DURATIONS, PROCEDURE_NAME_MAX } from './constants';

// Validação do formulário de procedimento (web). A API valida de novo na borda.
export const procedureFormSchema = z.object({
  name: z.string().trim().min(1).max(PROCEDURE_NAME_MAX),
  durationMinutes: z
    .number()
    .int()
    .refine((v) => (PROCEDURE_DURATIONS as readonly number[]).includes(v)),
});
export type ProcedureFormValues = z.infer<typeof procedureFormSchema>;
