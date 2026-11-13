import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BLOCK_REASON_MAX, blockFormSchema } from '@sistema-agendamento/shared-types';
import { messageFor } from '@/lib/api-errors';
import { BlockForm } from './block-form';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Campos de data/hora nativos: fireEvent.change independe do suporte do jsdom a digitação. */
function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function pickMode(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Dia(s) inteiro(s)' | 'Período',
) {
  await user.click(screen.getByRole('radio', { name }));
}

function lastRequest(): { pathname: string; method: string | undefined; body: unknown } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    pathname: new URL(url).pathname,
    method: init.method,
    body: JSON.parse(init.body as string),
  };
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

describe('[RN-42] blockFormSchema (shared-types)', () => {
  const fullDays = (fromDate: string, toDate: string, reason?: string) => ({
    kind: 'FULL_DAYS' as const,
    fromDate,
    toDate,
    reason,
  });
  const period = (startAt: string, endAt: string, reason?: string) => ({
    kind: 'PERIOD' as const,
    startAt,
    endAt,
    reason,
  });

  it('[W] dia inteiro aceita fromDate = toDate e fromDate < toDate', () => {
    expect(blockFormSchema.safeParse(fullDays('2026-11-16', '2026-11-16')).success).toBe(true);
    expect(blockFormSchema.safeParse(fullDays('2026-11-16', '2026-11-20')).success).toBe(true);
  });

  it('[W] dia inteiro recusa toDate < fromDate', () => {
    expect(blockFormSchema.safeParse(fullDays('2026-11-20', '2026-11-16')).success).toBe(false);
  });

  it('[W] período aceita fim > início', () => {
    expect(
      blockFormSchema.safeParse(period('2026-11-09T12:15:00.000Z', '2026-11-09T12:45:00.000Z'))
        .success,
    ).toBe(true);
  });

  it('[W] período recusa fim = início e fim < início', () => {
    expect(
      blockFormSchema.safeParse(period('2026-11-09T12:15:00.000Z', '2026-11-09T12:15:00.000Z'))
        .success,
    ).toBe(false);
    expect(
      blockFormSchema.safeParse(period('2026-11-09T12:45:00.000Z', '2026-11-09T12:15:00.000Z'))
        .success,
    ).toBe(false);
  });

  it('[W] motivo: aceita 200 caracteres e recusa 201 (nos dois modos)', () => {
    expect(BLOCK_REASON_MAX).toBe(200);
    const ok = 'a'.repeat(BLOCK_REASON_MAX);
    const long = 'a'.repeat(BLOCK_REASON_MAX + 1);
    expect(blockFormSchema.safeParse(fullDays('2026-11-16', '2026-11-16', ok)).success).toBe(true);
    expect(blockFormSchema.safeParse(fullDays('2026-11-16', '2026-11-16', long)).success).toBe(
      false,
    );
    const s = '2026-11-09T12:15:00.000Z';
    const e = '2026-11-09T12:45:00.000Z';
    expect(blockFormSchema.safeParse(period(s, e, ok)).success).toBe(true);
    expect(blockFormSchema.safeParse(period(s, e, long)).success).toBe(false);
  });
});

describe('[RN-42] BlockForm - dia(s) inteiro(s)', () => {
  it('[W] tem os modos "Dia(s) inteiro(s)" e "Período", os campos de cada um e "Criar bloqueio"', async () => {
    // Dado o formulário
    const user = userEvent.setup();
    render(<BlockForm />);
    // Então
    expect(screen.getByRole('radio', { name: 'Dia(s) inteiro(s)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Período' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar bloqueio' })).toBeInTheDocument();
    await pickMode(user, 'Dia(s) inteiro(s)');
    expect(screen.getByLabelText('De')).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toBeInTheDocument();
    await pickMode(user, 'Período');
    expect(screen.getByLabelText('Data')).toBeInTheDocument();
    expect(screen.getByLabelText('Início')).toBeInTheDocument();
    expect(screen.getByLabelText('Fim')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
  });

  it('[W] "Até" anterior a "De" não chama a API e mostra o erro', async () => {
    // Dado de 20/11 até 16/11
    const user = userEvent.setup();
    render(<BlockForm />);
    await pickMode(user, 'Dia(s) inteiro(s)');
    setField('De', '2026-11-20');
    setField('Até', '2026-11-16');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    expect(
      await screen.findByText('A data final não pode ser anterior à inicial.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] 16/11 a 20/11 envia POST /blocks { kind: FULL_DAYS, fromDate, toDate } sem motivo', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'b1' }));
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<BlockForm onDone={onDone} />);
    await pickMode(user, 'Dia(s) inteiro(s)');
    setField('De', '2026-11-16');
    setField('Até', '2026-11-20');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({
      pathname: '/blocks',
      method: 'POST',
      body: { kind: 'FULL_DAYS', fromDate: '2026-11-16', toDate: '2026-11-20' },
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('[W] um único dia (De = Até) é aceito e o motivo vai aparado', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'b1' }));
    const user = userEvent.setup();
    render(<BlockForm />);
    await pickMode(user, 'Dia(s) inteiro(s)');
    setField('De', '2026-11-16');
    setField('Até', '2026-11-16');
    await user.type(screen.getByLabelText('Motivo'), '  Congresso  ');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(lastRequest().body).toEqual({
      kind: 'FULL_DAYS',
      fromDate: '2026-11-16',
      toDate: '2026-11-16',
      reason: 'Congresso',
    });
  });
});

describe('[RN-42] BlockForm - período', () => {
  async function fillPeriod(
    user: ReturnType<typeof userEvent.setup>,
    date: string,
    start: string,
    end: string,
  ) {
    await pickMode(user, 'Período');
    setField('Data', date);
    setField('Início', start);
    setField('Fim', end);
  }

  it('[W] 09/11 09:15–09:45 envia POST /blocks PERIOD com ISO UTC (Brasília = UTC-3)', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'b1' }));
    const user = userEvent.setup();
    render(<BlockForm />);
    await fillPeriod(user, '2026-11-09', '09:15', '09:45');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(lastRequest()).toEqual({
      pathname: '/blocks',
      method: 'POST',
      body: {
        kind: 'PERIOD',
        startAt: '2026-11-09T12:15:00.000Z',
        endAt: '2026-11-09T12:45:00.000Z',
      },
    });
  });

  it('[W] fim igual ao início não chama a API e mostra o erro', async () => {
    // Dado início = fim = 09:15
    const user = userEvent.setup();
    render(<BlockForm />);
    await fillPeriod(user, '2026-11-09', '09:15', '09:15');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    expect(
      await screen.findByText('O horário de fim deve ser depois do início.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] fim antes do início não chama a API e mostra o erro', async () => {
    // Dado início 09:45 e fim 09:15
    const user = userEvent.setup();
    render(<BlockForm />);
    await fillPeriod(user, '2026-11-09', '09:45', '09:15');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    expect(
      await screen.findByText('O horário de fim deve ser depois do início.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] período sem data ou horários não chama a API', async () => {
    // Dado o modo período vazio
    const user = userEvent.setup();
    render(<BlockForm />);
    await pickMode(user, 'Período');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] erro da API (VALIDATION_FAILED) mostra messageFor e não faz refresh', async () => {
    // Dado a API respondendo 400
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
        message: 'x',
      }),
    );
    const user = userEvent.setup();
    render(<BlockForm />);
    await fillPeriod(user, '2026-11-09', '09:15', '09:45');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));
    // Então
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('VALIDATION_FAILED'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
