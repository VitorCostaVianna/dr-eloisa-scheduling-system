'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROCEDURE_DURATIONS,
  PROCEDURE_NAME_MAX,
  procedureFormSchema,
  type ProcedureDto,
} from '@sistema-agendamento/shared-types';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_ERROR_MESSAGE, readApiError } from '@/lib/api-errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ProcedureFormProps {
  /** Ausente = criar (POST /procedures); presente = editar (PATCH /procedures/:id). */
  procedure?: ProcedureDto;
  /** Chamado após sucesso (antes do router.refresh()) ou ao cancelar. */
  onDone?: () => void;
}

const NAME_REQUIRED = 'Informe o nome do procedimento.';
const DURATION_ITEMS = PROCEDURE_DURATIONS.map((d) => ({ value: d, label: `${d} min` }));

export function ProcedureForm({ procedure, onDone }: ProcedureFormProps) {
  const router = useRouter();
  const uid = useId();
  const nameId = `${uid}-name`;
  const durationLabelId = `${uid}-duration`;
  const nameErrorId = `${uid}-name-error`;
  const [name, setName] = useState(procedure?.name ?? '');
  const [duration, setDuration] = useState<number>(
    procedure?.durationMinutes ?? PROCEDURE_DURATIONS[0],
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    // Na prática só o nome pode falhar: a duração vem de um Select fechado em 30/60/90.
    const parsed = procedureFormSchema.safeParse({ name, durationMinutes: duration });
    if (!parsed.success) {
      setNameError(NAME_REQUIRED);
      return;
    }
    setNameError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(procedure ? `/procedures/${procedure.id}` : '/procedures', {
        method: procedure ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setApiError((await readApiError(res)).message);
        return;
      }
      if (!procedure) setName('');
      onDone?.();
      router.refresh();
    } catch {
      setApiError(DEFAULT_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Nome</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={PROCEDURE_NAME_MAX}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {nameError && (
          <p id={nameErrorId} className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label id={durationLabelId}>Duração</Label>
        <Select
          items={DURATION_ITEMS}
          value={duration}
          onValueChange={(v) => v !== null && setDuration(v)}
        >
          <SelectTrigger aria-labelledby={durationLabelId} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={submitting} className="self-end">
        {procedure ? 'Salvar' : 'Criar procedimento'}
      </Button>
      {procedure && (
        <Button type="button" variant="outline" className="self-end" onClick={() => onDone?.()}>
          Cancelar
        </Button>
      )}
      {apiError && (
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
