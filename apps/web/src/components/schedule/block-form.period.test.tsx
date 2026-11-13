import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clinicLocalToIso } from '@/lib/clinic-time';
import { BlockForm } from './block-form';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('[RN-42] BlockForm - período em dias diferentes', () => {
  it('[W] sexta 16:00 até sábado 09:00 envia startAt/endAt de cada data', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'b1' }), { status: 201 }));
    const user = userEvent.setup();
    render(<BlockForm />);
    await user.click(screen.getByRole('radio', { name: 'Período' }));
    setField('Data', '2026-11-13');
    setField('Início', '16:00');
    setField('Data de fim', '2026-11-14');
    setField('Fim', '09:00');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      kind: 'PERIOD',
      startAt: clinicLocalToIso('2026-11-13', '16:00'),
      endAt: clinicLocalToIso('2026-11-14', '09:00'),
    });
  });

  it('[W] data de fim anterior à de início não chama a API', async () => {
    // Dado início sábado 09:00 e fim sexta 16:00
    const user = userEvent.setup();
    render(<BlockForm />);
    await user.click(screen.getByRole('radio', { name: 'Período' }));
    setField('Data', '2026-11-14');
    setField('Início', '09:00');
    setField('Data de fim', '2026-11-13');
    setField('Fim', '16:00');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    expect(
      await screen.findByText('O horário de fim deve ser depois do início.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] sem mexer na data de fim, ela acompanha a data de início', async () => {
    // Dado a API respondendo 201 e só "Data" preenchida
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'b1' }), { status: 201 }));
    const user = userEvent.setup();
    render(<BlockForm />);
    await user.click(screen.getByRole('radio', { name: 'Período' }));
    setField('Data', '2026-11-09');
    // Então
    expect(screen.getByLabelText('Data de fim')).toHaveValue('2026-11-09');
  });
});
