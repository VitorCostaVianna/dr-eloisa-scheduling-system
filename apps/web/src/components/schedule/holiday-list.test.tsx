import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HolidayDto } from '@sistema-agendamento/shared-types';
import { messageFor } from '@/lib/api-errors';
import { HolidayList } from './holiday-list';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

const finados: HolidayDto = { date: '2026-11-02', name: 'Finados', overridden: false };
const imaculada: HolidayDto = {
  date: '2026-12-08',
  name: 'Imaculada Conceição',
  overridden: false,
};
const natal: HolidayDto = { date: '2026-12-25', name: 'Natal', overridden: true };

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function items() {
  return within(screen.getByRole('list', { name: 'Feriados' })).getAllByRole('listitem');
}

describe('[W] HolidayList - renderização', () => {
  // CA-1.8: Dado 02/11/2026 (Finados), 20/11/2026, 25/12/2026, 08/12/2026 (Imaculada Conceição,
  // BH) ... o painel mostra cada um como feriado com o nome.
  it('[W] um item por feriado, com data por extenso e nome', () => {
    // Dado três feriados de 2026
    render(<HolidayList holidays={[finados, imaculada, natal]} year={2026} />);
    // Então
    const rows = items();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Finados');
    expect(rows[0]).toHaveTextContent('2 de novembro');
    expect(rows[1]).toHaveTextContent('Imaculada Conceição');
    expect(rows[1]).toHaveTextContent('terça-feira, 8 de dezembro');
    expect(rows[2]).toHaveTextContent('Natal');
    expect(rows[2]).toHaveTextContent('25 de dezembro');
  });

  // CA-1.23: Dado 08/12/2026 (feriado, terça), quando a dentista desbloqueia esse dia, ... o painel
  // mostra o dia como "feriado — atendendo".
  it('[W] não desbloqueado mostra "feriado — fechado"; desbloqueado, "feriado — atendendo"', () => {
    // Dado um fechado e um desbloqueado
    render(<HolidayList holidays={[imaculada, natal]} year={2026} />);
    const [fechado, atendendo] = items();
    // Então
    expect(within(fechado).getByText('feriado — fechado')).toBeInTheDocument();
    expect(within(fechado).queryByText('feriado — atendendo')).not.toBeInTheDocument();
    expect(within(atendendo).getByText('feriado — atendendo')).toBeInTheDocument();
    expect(within(atendendo).queryByText('feriado — fechado')).not.toBeInTheDocument();
  });

  it('[W] fechado só oferece "Atender neste dia"; atendendo só oferece "Voltar a fechar"', () => {
    // Dado um fechado e um desbloqueado
    render(<HolidayList holidays={[imaculada, natal]} year={2026} />);
    const [fechado, atendendo] = items();
    // Então
    expect(within(fechado).getByRole('button', { name: /^Atender neste dia/ })).toBeInTheDocument();
    expect(
      within(fechado).queryByRole('button', { name: /^Voltar a fechar/ }),
    ).not.toBeInTheDocument();
    expect(within(atendendo).getByRole('button', { name: /^Voltar a fechar/ })).toBeInTheDocument();
    expect(
      within(atendendo).queryByRole('button', { name: /^Atender neste dia/ }),
    ).not.toBeInTheDocument();
  });
});

describe('[W] HolidayList - ações', () => {
  it('[W] "Atender neste dia" faz POST /holiday-overrides { date } e router.refresh()', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'o1', date: '2026-12-08' }), { status: 201 }),
    );
    const user = userEvent.setup();
    render(<HolidayList holidays={[finados, imaculada]} year={2026} />);
    // Quando desbloqueia 08/12
    await user.click(within(items()[1]).getByRole('button', { name: /^Atender neste dia/ }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/holiday-overrides');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ date: '2026-12-08' });
  });

  it('[W] "Voltar a fechar" faz DELETE /holiday-overrides/2026-12-25 e router.refresh()', async () => {
    // Dado a API respondendo 204
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    render(<HolidayList holidays={[imaculada, natal]} year={2026} />);
    // Quando volta a fechar o Natal
    await user.click(within(items()[1]).getByRole('button', { name: /^Voltar a fechar/ }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/holiday-overrides/2026-12-25');
    expect(init.method).toBe('DELETE');
  });

  it('[W] erro NOT_A_HOLIDAY mostra a mensagem do código e não faz refresh', async () => {
    // Dado a API respondendo 422 NOT_A_HOLIDAY
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_A_HOLIDAY', message: 'x', statusCode: 422 }), {
        status: 422,
      }),
    );
    const user = userEvent.setup();
    render(<HolidayList holidays={[imaculada]} year={2026} />);
    // Quando tenta desbloquear
    await user.click(screen.getByRole('button', { name: /^Atender neste dia/ }));
    // Então
    expect(await screen.findByText(messageFor('NOT_A_HOLIDAY'))).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
