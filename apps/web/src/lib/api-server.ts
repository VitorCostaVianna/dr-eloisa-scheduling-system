import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ErrorCode } from '@sistema-agendamento/shared-types';
import { parseErrorCode } from './api-errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: ErrorCode,
    message?: string,
  ) {
    super(message ?? `API respondeu ${status}`);
    this.name = 'ApiError';
  }
}

/**
 * GET autenticado a partir de um Server Component: repassa os cookies da requisição.
 * 401 -> redirect('/login'); outro erro -> ApiError.
 */
export async function apiServer<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new ApiError(res.status, parseErrorCode(body));
  }
  return (await res.json()) as T;
}
