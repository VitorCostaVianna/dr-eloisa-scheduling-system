import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProcedureDto } from '@sistema-agendamento/shared-types';
import { messageFor } from '@/lib/api-errors';
import { ProcedureList } from './procedure-list';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

const limpeza: ProcedureDto = { id: 'p1', name: 'Limpeza', durationMinutes: 60, active: true };
const clareamento: ProcedureDto = { id: 'p2', name: 'Clareamento', durationMinutes: 90, active: false };

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('[W] ProcedureList - renderização', () => {
  it('[W] lista com aria-label "Procedimentos" e um item por procedimento, com nome e duração', () => {
    // Dado dois procedimentos
    render(<ProcedureList procedures={[limpeza, clareamento]} />);
    // Então
    const list = screen.getByRole('list', { name: 'Procedimentos' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Limpeza');
    expect(items[0]).toHaveTextContent('60 min');
    expect(items[1]).toHaveTextContent('Clareamento');
    expect(items[1]).toHaveTextContent('90 min');
  });

  it('[W] só o procedimento inativo mostra "inativo"', () => {
    // Dado um ativo e um inativo
    render(<ProcedureList procedures={[limpeza, clareamento]} />);
    const [ativo, inativo] = within(screen.getByRole('list', { name: 'Procedimentos' })).getAllByRole('listitem');
    // Então
    expect(within(ativo).queryByText('inativo')).not.toBeInTheDocument();
    expect(within(inativo).getByText('inativo')).toBeInTheDocument();
  });

  it('[W] ativo tem "Desativar <nome>"; inativo tem "Reativar <nome>"; ambos têm "Editar <nome>"', () => {
    // Dado um ativo e um inativo
    render(<ProcedureList procedures={[limpeza, clareamento]} />);
    // Então
    expect(screen.getByRole('button', { name: 'Editar Limpeza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Limpeza' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reativar Limpeza' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Clareamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar Clareamento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Clareamento' })).not.toBeInTheDocument();
  });

  it('[W] lista vazia não tem itens', () => {
    // Dado nenhum procedimento
    render(<ProcedureList procedures={[]} />);
    // Então
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('[W] ProcedureList - ações', () => {
  it('[W] "Desativar Limpeza" faz PATCH /procedures/p1 { active: false } e router.refresh()', async () => {
    // Dado a API respondendo 200
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...limpeza, active: false }), { status: 200 }));
    const user = userEvent.setup();
    render(<ProcedureList procedures={[limpeza]} />);
    // Quando desativa
    await user.click(screen.getByRole('button', { name: 'Desativar Limpeza' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/procedures/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ active: false });
  });

  it('[W] "Reativar Clareamento" faz PATCH /procedures/p2 { active: true }', async () => {
    // Dado a API respondendo 200
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...clareamento, active: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<ProcedureList procedures={[clareamento]} />);
    // Quando reativa
    await user.click(screen.getByRole('button', { name: 'Reativar Clareamento' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/procedures/p2');
    expect(JSON.parse(init.body as string)).toEqual({ active: true });
  });

  it('[W] erro ao desativar mostra a mensagem do código (role alert) e não faz refresh', async () => {
    // Dado a API respondendo 404 NOT_FOUND
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'x', statusCode: 404 }), { status: 404 }),
    );
    const user = userEvent.setup();
    render(<ProcedureList procedures={[limpeza]} />);
    // Quando desativa
    await user.click(screen.getByRole('button', { name: 'Desativar Limpeza' }));
    // Então
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('NOT_FOUND'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] "Editar Limpeza" abre o formulário preenchido com "Salvar"/"Cancelar"; "Cancelar" fecha', async () => {
    // Dado a lista
    const user = userEvent.setup();
    render(<ProcedureList procedures={[limpeza]} />);
    // Quando clica em Editar
    await user.click(screen.getByRole('button', { name: 'Editar Limpeza' }));
    // Então
    expect(screen.getByLabelText('Nome')).toHaveValue('Limpeza');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    // Quando cancela
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    // Então
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
