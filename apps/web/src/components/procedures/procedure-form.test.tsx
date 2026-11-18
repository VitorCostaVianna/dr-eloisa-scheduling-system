import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PROCEDURE_DURATIONS,
  procedureFormSchema,
  type ProcedureDto,
} from '@sistema-agendamento/shared-types';
import { DEFAULT_ERROR_MESSAGE, messageFor } from '@/lib/api-errors';
import { ProcedureForm } from './procedure-form';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Troca a duração no select (base-ui: trigger com role combobox, opções com role option). */
async function pickDuration(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('combobox', { name: 'Duração' }));
  await user.click(await screen.findByRole('option', { name: label }));
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

describe('[W] procedureFormSchema (shared-types)', () => {
  it('[W] aceita 30, 60 e 90 minutos', () => {
    for (const durationMinutes of PROCEDURE_DURATIONS) {
      expect(procedureFormSchema.safeParse({ name: 'Limpeza', durationMinutes }).success).toBe(true);
    }
  });

  it('[W] recusa duração 45', () => {
    expect(procedureFormSchema.safeParse({ name: 'Limpeza', durationMinutes: 45 }).success).toBe(false);
  });

  it('[W] recusa nome vazio ou só com espaços', () => {
    expect(procedureFormSchema.safeParse({ name: '', durationMinutes: 30 }).success).toBe(false);
    expect(procedureFormSchema.safeParse({ name: '   ', durationMinutes: 30 }).success).toBe(false);
  });

  it('[W] recusa nome com 101 caracteres e aceita com 100', () => {
    expect(procedureFormSchema.safeParse({ name: 'a'.repeat(101), durationMinutes: 30 }).success).toBe(false);
    expect(procedureFormSchema.safeParse({ name: 'a'.repeat(100), durationMinutes: 30 }).success).toBe(true);
  });

  it('[W] apara o nome: "  Limpeza  " vira "Limpeza"', () => {
    const parsed = procedureFormSchema.parse({ name: '  Limpeza  ', durationMinutes: 60 });
    expect(parsed.name).toBe('Limpeza');
  });
});

describe('[W] ProcedureForm - criar', () => {
  it('[W] tem os campos "Nome" e "Duração" (30, 60 e 90 min)', async () => {
    // Dado o formulário de criação
    const user = userEvent.setup();
    render(<ProcedureForm />);
    // Então
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar procedimento' })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Duração' }));
    expect(await screen.findByRole('option', { name: '30 min' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '60 min' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '90 min' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('[W] nome vazio não chama a API e mostra "Informe o nome do procedimento."', async () => {
    // Dado o formulário de criação com o nome em branco
    const user = userEvent.setup();
    render(<ProcedureForm />);
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    expect(await screen.findByText('Informe o nome do procedimento.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] nome só com espaços também não chama a API', async () => {
    // Dado um nome com espaços apenas
    const user = userEvent.setup();
    render(<ProcedureForm />);
    await user.type(screen.getByLabelText('Nome'), '   ');
    // Quando envia
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    expect(await screen.findByText('Informe o nome do procedimento.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] sucesso: POST /procedures com { name, durationMinutes } (nome aparado), depois router.refresh()', async () => {
    // Dado a API respondendo 201
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: 'p1', name: 'Limpeza', durationMinutes: 60, active: true }),
    );
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<ProcedureForm onDone={onDone} />);
    // Quando preenche "  Limpeza  " com 60 min e envia
    await user.type(screen.getByLabelText('Nome'), '  Limpeza  ');
    await pickDuration(user, '60 min');
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/procedures');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Limpeza', durationMinutes: 60 });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('[W] 409 PROCEDURE_NAME_TAKEN mostra messageFor desse código e não faz refresh', async () => {
    // Dado a API respondendo 409 com o código de nome repetido
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'PROCEDURE_NAME_TAKEN', message: 'x', statusCode: 409 }),
    );
    const user = userEvent.setup();
    render(<ProcedureForm />);
    // Quando envia um nome que já existe
    await user.type(screen.getByLabelText('Nome'), 'Limpeza');
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messageFor('PROCEDURE_NAME_TAKEN'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] corpo de erro ilegível (HTML) mostra a mensagem padrão', async () => {
    // Dado um 500 com corpo que não é JSON
    fetchMock.mockResolvedValue(new Response('<html>erro</html>', { status: 500 }));
    const user = userEvent.setup();
    render(<ProcedureForm />);
    // Quando envia
    await user.type(screen.getByLabelText('Nome'), 'Limpeza');
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    expect(await screen.findByRole('alert')).toHaveTextContent(DEFAULT_ERROR_MESSAGE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] erro de rede (fetch rejeita) mostra a mensagem padrão', async () => {
    // Dado a rede fora do ar
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<ProcedureForm />);
    // Quando envia
    await user.type(screen.getByLabelText('Nome'), 'Limpeza');
    await user.click(screen.getByRole('button', { name: 'Criar procedimento' }));
    // Então
    expect(await screen.findByRole('alert')).toHaveTextContent(DEFAULT_ERROR_MESSAGE);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('[W] ProcedureForm - editar', () => {
  const procedure: ProcedureDto = { id: 'p-42', name: 'Limpeza', durationMinutes: 60, active: true };

  it('[W] vem preenchido com o procedimento e mostra "Salvar" e "Cancelar"', () => {
    // Dado o formulário de edição
    render(<ProcedureForm procedure={procedure} />);
    // Então
    expect(screen.getByLabelText('Nome')).toHaveValue('Limpeza');
    expect(screen.getByRole('combobox', { name: 'Duração' })).toHaveTextContent('60 min');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar procedimento' })).not.toBeInTheDocument();
  });

  it('[W] sucesso: PATCH /procedures/p-42 com o nome novo, onDone e router.refresh()', async () => {
    // Dado a API respondendo 200
    fetchMock.mockResolvedValue(jsonResponse(200, { ...procedure, name: 'Profilaxia' }));
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<ProcedureForm procedure={procedure} onDone={onDone} />);
    // Quando troca o nome e salva
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), 'Profilaxia');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    // Então
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/procedures/p-42');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ name: 'Profilaxia' });
    expect(body).not.toHaveProperty('active');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('[W] editar com nome vazio não chama a API', async () => {
    // Dado a edição com o nome apagado
    const user = userEvent.setup();
    render(<ProcedureForm procedure={procedure} />);
    await user.clear(screen.getByLabelText('Nome'));
    // Quando salva
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    // Então
    expect(await screen.findByText('Informe o nome do procedimento.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('[W] editar: 409 PROCEDURE_NAME_TAKEN mostra a mensagem do código', async () => {
    // Dado a API recusando o nome
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'PROCEDURE_NAME_TAKEN', message: 'x', statusCode: 409 }),
    );
    const user = userEvent.setup();
    render(<ProcedureForm procedure={procedure} />);
    // Quando salva
    await user.type(screen.getByLabelText('Nome'), ' 2');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    // Então
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('PROCEDURE_NAME_TAKEN'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('[W] "Cancelar" chama onDone sem chamar a API', async () => {
    // Dado a edição aberta
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<ProcedureForm procedure={procedure} onDone={onDone} />);
    // Quando cancela
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    // Então
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
