'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  BLOCK_REASON_MAX,
  blockFormSchema,
  type CreateBlockRequest,
} from '@sistema-agendamento/shared-types';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_ERROR_MESSAGE, readApiError } from '@/lib/api-errors';
import { clinicLocalToIso } from '@/lib/clinic-time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface BlockFormProps {
  /** Chamado após criar o bloqueio (antes do router.refresh()). */
  onDone?: () => void;
}

type Mode = CreateBlockRequest['kind'];

const MISSING_DAYS = 'Informe a data inicial e a final.';
const MISSING_PERIOD = 'Informe as datas e os horários de início e fim.';
const INVALID_FORM = 'Alguns dados estão inválidos. Confira os campos e tente de novo.';

const MODES: ReadonlyArray<readonly [Mode, string]> = [
  ['FULL_DAYS', 'Dia(s) inteiro(s)'],
  ['PERIOD', 'Período'],
];

export function BlockForm({ onDone }: BlockFormProps) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>('FULL_DAYS');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  // Sem alteração do usuário, a data de fim acompanha a data de início.
  const [endDateOverride, setEndDateOverride] = useState<string | null>(null);
  const endDate = endDateOverride ?? date;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function buildCandidate(): { value: unknown } | { missing: string } {
    const trimmed = reason.trim();
    const reasonPart = trimmed ? { reason: trimmed } : {};
    if (mode === 'FULL_DAYS') {
      if (!fromDate || !toDate) return { missing: MISSING_DAYS };
      return { value: { kind: mode, fromDate, toDate, ...reasonPart } };
    }
    if (!date || !endDate || !start || !end) return { missing: MISSING_PERIOD };
    return {
      value: {
        kind: mode,
        startAt: clinicLocalToIso(date, start),
        endAt: clinicLocalToIso(endDate, end),
        ...reasonPart,
      },
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    let candidate: ReturnType<typeof buildCandidate>;
    try {
      candidate = buildCandidate();
    } catch {
      setError(INVALID_FORM);
      return;
    }
    if ('missing' in candidate) {
      setError(candidate.missing);
      return;
    }
    const parsed = blockFormSchema.safeParse(candidate.value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? INVALID_FORM);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        return;
      }
      setReason('');
      onDone?.();
      router.refresh();
    } catch {
      setError(DEFAULT_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  const id = (suffix: string) => `${uid}-${suffix}`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-4">
      <fieldset className="flex gap-4">
        <legend className="sr-only">Tipo de bloqueio</legend>
        {MODES.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={id('mode')}
              checked={mode === value}
              onChange={() => {
                setMode(value);
                setError(null);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === 'FULL_DAYS' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('from')}>De</Label>
            <Input
              id={id('from')}
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('to')}>Até</Label>
            <Input
              id={id('to')}
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('date')}>Data</Label>
            <Input
              id={id('date')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('start')}>Início</Label>
            <Input
              id={id('start')}
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('end-date')}>Data de fim</Label>
            <Input
              id={id('end-date')}
              type="date"
              value={endDate}
              onChange={(e) => setEndDateOverride(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id('end')}>Fim</Label>
            <Input
              id={id('end')}
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id('reason')}>Motivo</Label>
        <Input
          id={id('reason')}
          value={reason}
          maxLength={BLOCK_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting} className="self-end">
        Criar bloqueio
      </Button>
      {error && (
        <Alert variant="destructive" className="basis-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
