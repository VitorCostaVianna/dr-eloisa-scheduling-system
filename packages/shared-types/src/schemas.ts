import { z } from 'zod';
import { BLOCK_REASON_MAX, PROCEDURE_DURATIONS, PROCEDURE_NAME_MAX } from './constants';

// Validação do formulário de procedimento (web). A API valida de novo na borda.
export const procedureFormSchema = z.object({
  name: z.string().trim().min(1).max(PROCEDURE_NAME_MAX),
  durationMinutes: z
    .number()
    .int()
    .refine((v) => (PROCEDURE_DURATIONS as readonly number[]).includes(v)),
});
export type ProcedureFormValues = z.infer<typeof procedureFormSchema>;

// Validação do formulário de bloqueio (web), discriminada por `kind`; a forma de entrada é a de
// CreateBlockRequest. A comparação fica num superRefine porque o zod 3 só aceita ZodObject puro
// dentro de discriminatedUnion.
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const reasonSchema = z.string().max(BLOCK_REASON_MAX).optional();
const localDateSchema = z.string().regex(LOCAL_DATE_RE);
const instantSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)));

export const blockFormSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('FULL_DAYS'),
      fromDate: localDateSchema,
      toDate: localDateSchema,
      reason: reasonSchema,
    }),
    z.object({
      kind: z.literal('PERIOD'),
      startAt: instantSchema,
      endAt: instantSchema,
      reason: reasonSchema,
    }),
  ])
  .superRefine((v, ctx) => {
    // 'YYYY-MM-DD' ordena como texto; os instantes ISO UTC são comparados como números.
    if (v.kind === 'FULL_DAYS' && v.toDate < v.fromDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['toDate'],
        message: 'A data final não pode ser anterior à inicial.',
      });
    }
    if (v.kind === 'PERIOD' && Date.parse(v.endAt) <= Date.parse(v.startAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'O horário de fim deve ser depois do início.',
      });
    }
  });
export type BlockFormValues = z.infer<typeof blockFormSchema>;
