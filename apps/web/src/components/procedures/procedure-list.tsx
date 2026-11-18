'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProcedureDto } from '@sistema-agendamento/shared-types';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_ERROR_MESSAGE, readApiError } from '@/lib/api-errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProcedureForm } from './procedure-form';

export interface ProcedureListProps {
  procedures: ProcedureDto[];
}

export function ProcedureList({ procedures }: ProcedureListProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // O ref fecha a janela entre o clique e o re-render que aplica o `disabled`.
  const inFlight = useRef(false);

  async function setActive(procedure: ProcedureDto, active: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingId(procedure.id);
    setError(null);
    try {
      const res = await apiFetch(`/procedures/${procedure.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
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
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {procedures.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum procedimento cadastrado.</p>
      )}
      <ul aria-label="Procedimentos" className="flex flex-col gap-2">
        {procedures.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            {editingId === p.id ? (
              <ProcedureForm procedure={p} onDone={() => setEditingId(null)} />
            ) : (
              <>
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">{p.durationMinutes} min</span>
                {!p.active && <Badge variant="secondary">inativo</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Editar ${p.name}`}
                  disabled={pendingId !== null}
                  onClick={() => setEditingId(p.id)}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${p.active ? 'Desativar' : 'Reativar'} ${p.name}`}
                  disabled={pendingId !== null}
                  onClick={() => setActive(p, !p.active)}
                >
                  {p.active ? 'Desativar' : 'Reativar'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
