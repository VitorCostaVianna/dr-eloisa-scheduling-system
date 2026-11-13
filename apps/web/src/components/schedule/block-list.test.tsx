import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BlockDto } from '@sistema-agendamento/shared-types';
import { messageFor } from '@/lib/api-errors';
import { BlockList } from './block-list';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

// 09/11 09:15–09:45 em Brasília (UTC-3)
const periodo: BlockDto = {
  id: 'b1',
  startAt: '2026-11-09T12:15:00.000Z',
  endAt: '2026-11-09T12:45:00.000Z',
  reason: 'Reunião com o contador',
  createdAt: '2026-11-01T10:00:00.000Z',
};
// 16/11 a 20/11 inteiros, sem motivo
const diasInteiros: BlockDto = {
  id: 'b2',
  startAt: '2026-11-16T03:00:00.000Z',
  endAt: '2026-11-21T03:00:00.000Z',
  reason: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('[RN-42] BlockList - renderização', () => {
  it('[W] lista "Bloqueios" com um item por bloqueio, motivo e horário de Brasília', () => {
    // Dado dois bloqueios
    render(<BlockList blocks={[periodo, diasInteiros]} />);
    // Então
    const items = within(screen.getByRole('list', { name: 'Bloqueios' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Reunião com o contador');
    expect(items[0]).toHaveTextContent('09:15');
    expect(items[0]).toHaveTextContent('09:45');
    // E nunca o horário UTC
    expect(items[0]).not.toHaveTextContent('12:15');
  });

  it('[W] sem bloqueios mostra "Nenhum bloqueio cadastrado."', () => {
    // Dado nenhum bloqueio
    render(<BlockList blocks={[]} />);
    // Então
    expect(screen.getByText('Nenhum bloqueio cadastrado.')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('[RN-42] BlockList - excluir', () => {
  function deleteButtonOf(index: number) {
    const item = within(screen.getByRole('list', { name: 'Bloqueios' })).getAllByRole('listitem')[
      index
    ];
    return within(item).getByRole('button', { name: /^Excluir/ });
  }

  it('[W] "Excluir" abre um Dialog de confirmação, sem API e sem window.confirm', async () => {
    // Dado a lista e um window.confirm espionado
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<BlockList blocks={[periodo]} />);
    // Quando clica em Excluir
    await user.click(deleteButtonOf(0));
    // Então
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('[W] confirmar faz DELETE /blocks/b2 e router.refresh()', async () => {
    // Dado a API respondendo 204
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    render(<BlockList blocks={[periodo, diasInteiros]} />);
    // Quando abre o diálogo do segundo bloqueio e confirma
    await user.click(deleteButtonOf(1));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/blocks/b2');
    expect(init.method).toBe('DELETE');
  });

  it('[W] cancelar fecha o Dialog sem chamar a API', async () => {
    // Dado o diálogo aberto
    const user = userEvent.setup();
    render(<BlockList blocks={[periodo]} />);
    await user.click(deleteButtonOf(0));
    const dialog = await screen.findByRole('dialog');
    // Quando cancela
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    // Então
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] excluir com sucesso leva o foco para a lista', async () => {
    // Dado a API respondendo 204 e um refresh que remove o item (como o servidor faz)
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    const { rerender } = render(<BlockList blocks={[periodo]} />);
    refresh.mockImplementation(() => rerender(<BlockList blocks={[]} />));
    // Quando confirma a exclusão
    await user.click(deleteButtonOf(0));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    // Então o foco vai para a lista (o botão de origem sumiu com o item)
    await waitFor(() => expect(screen.getByRole('list', { name: 'Bloqueios' })).toHaveFocus());
  });

  it('[W] cancelar devolve o foco ao botão Excluir de origem', async () => {
    // Dado o diálogo aberto a partir do segundo item
    const user = userEvent.setup();
    render(<BlockList blocks={[periodo, diasInteiros]} />);
    await user.click(deleteButtonOf(1));
    const dialog = await screen.findByRole('dialog');
    // Quando cancela
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    // Então
    await waitFor(() => expect(deleteButtonOf(1)).toHaveFocus());
  });

  it('[W] excluir A com sucesso e depois cancelar em C devolve o foco ao botão de C', async () => {
    // Dado três bloqueios e um refresh que remove o excluído
    const terceiro: BlockDto = { ...diasInteiros, id: 'b3' };
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    const { rerender } = render(<BlockList blocks={[periodo, diasInteiros, terceiro]} />);
    refresh.mockImplementation(() => rerender(<BlockList blocks={[diasInteiros, terceiro]} />));
    await user.click(deleteButtonOf(0));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Quando abre o diálogo do último e cancela
    await user.click(deleteButtonOf(1));
    const dialogC = await screen.findByRole('dialog');
    await user.click(within(dialogC).getByRole('button', { name: 'Cancelar' }));
    // Então o foco volta ao botão do último, não à lista nem ao primeiro botão
    await waitFor(() => expect(deleteButtonOf(1)).toHaveFocus());
  });

  it('[W] erro da API ao excluir mostra messageFor(NOT_FOUND) e não faz refresh', async () => {
    // Dado a API respondendo 404
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'x', statusCode: 404 }), {
        status: 404,
      }),
    );
    const user = userEvent.setup();
    render(<BlockList blocks={[periodo]} />);
    // Quando confirma a exclusão
    await user.click(deleteButtonOf(0));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    // Então
    expect(await screen.findByText(messageFor('NOT_FOUND'))).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
