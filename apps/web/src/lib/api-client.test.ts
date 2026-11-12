import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redirectToLogin = vi.hoisted(() => vi.fn());
vi.mock('./session-redirect', () => ({ redirectToLogin }));
import { apiFetch } from './api-client';

const fetchMock = vi.fn();
beforeEach(() => {
  redirectToLogin.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('[W] apiFetch', () => {
  it('401, refresh falha: devolve o 401 e redireciona ao login', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const res = await apiFetch('/procedures');
    expect(res.status).toBe(401);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it('401, refresh ok e repetição ok: não redireciona', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await apiFetch('/procedures');
    expect(res.status).toBe(200);
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  it('401 em /auth/* (ex.: senha errada) não redireciona', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    await apiFetch('/auth/login', { method: 'POST' });
    expect(redirectToLogin).not.toHaveBeenCalled();
  });
});
