'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HOLIDAY_YEAR_MAX,
  HOLIDAY_YEAR_MIN,
  type HolidayDto,
} from '@sistema-agendamento/shared-types';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_ERROR_MESSAGE, readApiError } from '@/lib/api-errors';
import { formatClinicDate } from '@/lib/clinic-time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';

export interface HolidayListProps {
  holidays: HolidayDto[];
  year: number;
}

export function HolidayList({ holidays, year }: HolidayListProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  // O ref fecha a janela entre o clique e o re-render que aplica o `disabled`.
  const inFlight = useRef(false);

  async function toggle(holiday: HolidayDto) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingDate(holiday.date);
    setError(null);
    try {
      const res = holiday.overridden
        ? await apiFetch(`/holiday-overrides/${holiday.date}`, { method: 'DELETE' })
        : await apiFetch('/holiday-overrides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: holiday.date }),
          });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        return;
      }
      router.refresh();
    } catch {
      setError(DEFAULT_ERROR_MESSAGE);
    } finally {
      inFlight.current = false;
      setPendingDate(null);
    }
  }

  const linkClass = buttonVariants({ variant: 'outline', size: 'sm' });
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Ano dos feriados" className="flex items-center gap-3">
        {year > HOLIDAY_YEAR_MIN && (
          <Link href={`?ano=${year - 1}`} className={linkClass}>
            Ano anterior
          </Link>
        )}
        <span className="font-medium">{year}</span>
        {year < HOLIDAY_YEAR_MAX && (
          <Link href={`?ano=${year + 1}`} className={linkClass}>
            Próximo ano
          </Link>
        )}
      </nav>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ul aria-label="Feriados" className="flex flex-col gap-2">
        {holidays.map((h) => {
          const action = h.overridden ? 'Voltar a fechar' : 'Atender neste dia';
          return (
            <li key={h.date} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <span className="font-medium">{formatClinicDate(h.date)}</span>
              <span>{h.name}</span>
              <span className="text-sm text-muted-foreground">
                {h.overridden ? 'feriado — atendendo' : 'feriado — fechado'}
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`${action} (${h.name})`}
                disabled={pendingDate !== null}
                onClick={() => toggle(h)}
              >
                {action}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
