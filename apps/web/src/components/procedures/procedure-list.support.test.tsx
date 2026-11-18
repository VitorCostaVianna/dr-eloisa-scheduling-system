import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProcedureDto } from '@sistema-agendamento/shared-types';
import { ProcedureList } from './procedure-list';

const refresh = vi.hoisted(() => vi.fn());
const redirectToLogin = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/session-redirect', () => ({ redirectToLogin }));

const fetchMock = vi.fn();
const limpeza: ProcedureDto = { id: 'p1', name: 'Limpeza', durationMinutes: 60, active: true };

beforeEach(() => {
  refresh.mockReset();
  redirectToLogin.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('[W] ProcedureList - apoio', () => {
  it('duplo clique em Desativar gera um único PATCH e desabilita os botões durante a chamada', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ProcedureList procedures={[limpeza]} />);
    const button = screen.getByRole('button', { name: 'Desativar Limpeza' });
    await user.click(button);
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar Limpeza' })).toBeDisabled();
    resolve(new Response('{}', { status: 200 }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('lista vazia mostra "Nenhum procedimento cadastrado."', () => {
    render(<ProcedureList procedures={[]} />);
    expect(screen.getByText('Nenhum procedimento cadastrado.')).toBeInTheDocument();
  });

  it('401 final (sessão expirada) leva ao login', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const user = userEvent.setup();
    render(<ProcedureList procedures={[limpeza]} />);
    await user.click(screen.getByRole('button', { name: 'Desativar Limpeza' }));
    await waitFor(() => expect(redirectToLogin).toHaveBeenCalledTimes(1));
    // 1 PATCH + 1 refresh (que falha: sem repetição)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });
});
