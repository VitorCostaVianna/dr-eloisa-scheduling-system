'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BlockDto } from '@sistema-agendamento/shared-types';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_ERROR_MESSAGE, readApiError } from '@/lib/api-errors';
import {
  addDays,
  formatClinicDate,
  formatClinicTime,
  localDateOf,
  localMinuteOf,
} from '@/lib/clinic-time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface BlockListProps {
  blocks: BlockDto[];
}

// Dia(s) inteiro(s) = de 00:00 local a 00:00 local; o fim é exclusivo, então o último dia é o anterior.
function describeBlock(block: BlockDto): string {
  const startDate = localDateOf(block.startAt);
  const fullDays = localMinuteOf(block.startAt) === 0 && localMinuteOf(block.endAt) === 0;
  if (fullDays) {
    const lastDate = addDays(localDateOf(block.endAt), -1);
    return startDate === lastDate
      ? formatClinicDate(startDate)
      : `${formatClinicDate(startDate)} a ${formatClinicDate(lastDate)}`;
  }
  const endDate = localDateOf(block.endAt);
  const start = `${formatClinicDate(startDate)}, ${formatClinicTime(block.startAt)}`;
  const end =
    endDate === startDate
      ? formatClinicTime(block.endAt)
      : `${formatClinicDate(endDate)}, ${formatClinicTime(block.endAt)}`;
  return `${start} às ${end}`;
}

export function BlockList({ blocks }: BlockListProps) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<BlockDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // O ref fecha a janela entre o clique e o re-render que aplica o `disabled`.
  const inFlight = useRef(false);
  // O botão que abriu o Dialog some junto com o item excluído: o foco vai para a lista.
  const listRef = useRef<HTMLUListElement>(null);
  const deletedRef = useRef(false);

  async function confirmDelete() {
    if (!toDelete || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    deletedRef.current = false;
    try {
      const res = await apiFetch(`/blocks/${toDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        return;
      }
      deletedRef.current = true;
      router.refresh();
    } catch {
      setError(DEFAULT_ERROR_MESSAGE);
    } finally {
      inFlight.current = false;
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum bloqueio cadastrado.</p>
      )}
      <ul ref={listRef} tabIndex={-1} aria-label="Bloqueios" className="flex flex-col gap-2 outline-none">
        {blocks.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="font-medium">{describeBlock(b)}</span>
            {b.reason && <span className="text-sm text-muted-foreground">{b.reason}</span>}
            <Button
              variant="outline"
              size="sm"
              aria-label={`Excluir bloqueio de ${describeBlock(b)}`}
              onClick={() => {
                // Uma exclusão anterior não pode desviar o foco de quem abre/cancela este Dialog.
                deletedRef.current = false;
                setToDelete(b);
              }}
            >
              Excluir
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setToDelete(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          finalFocus={() => (deletedRef.current ? listRef.current : true)}
        >
          <DialogHeader>
            <DialogTitle>Excluir bloqueio?</DialogTitle>
            <DialogDescription>
              {toDelete && `${describeBlock(toDelete)}. Esses horários voltam a ficar disponíveis.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
