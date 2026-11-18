import { redirectToLogin } from './session-redirect';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Wrapper de fetch para chamadas do BROWSER (client components) à API. Em caso de
// 401 (access token expirado), tenta renovar via /auth/refresh uma vez e repete a
// requisição original — a dentista não percebe o access token expirando a cada 15min.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
    });

  let response = await doFetch();

  if (response.status === 401) {
    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      response = await doFetch();
    }
  }

  // Access e refresh expirados: só o login resolve. /auth/* fica de fora porque lá o 401 é
  // resposta legítima (ex.: senha errada no login). O redirect de navegação é o
  // /api/refresh-and-continue (proxy); aqui, no browser, o refresh já foi tentado acima.
  if (response.status === 401 && !path.startsWith('/auth/')) {
    redirectToLogin();
  }

  return response;
}
