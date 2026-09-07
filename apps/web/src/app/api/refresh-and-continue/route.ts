import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Rota executada no runtime Node.js (padrão do App Router — sem `export const runtime =
// 'edge'`), porque precisa fazer duas coisas que o proxy.ts (Edge-style middleware) e os
// Server Components (ver lib/auth.ts) não conseguem fazer: ler múltiplos headers
// `Set-Cookie` da resposta da API (access_token + refresh_token, um por chamada de
// `res.cookie()`) e setar cookies numa resposta de redirect. Ver
// docs/superpowers/specs/2026-09-04-auth-module-design.md e o ADR sobre a
// navegação-time refresh no docs/decisions.md.
//
// Fluxo: proxy.ts manda pra cá quando o access_token expirou mas o refresh_token (7
// dias) ainda existe — em vez de forçar login de novo, essa rota tenta renovar a sessão
// silenciosamente e só cai pro /login se o refresh de fato falhar (refresh_token
// também expirado/revogado).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestedNext = request.nextUrl.searchParams.get('next');
  const next = isSafeRelativePath(requestedNext) ? requestedNext! : '/dashboard';

  const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  });

  if (!refreshResponse.ok) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const redirectResponse = NextResponse.redirect(new URL(next, request.url));

  // Uma única resposta fetch() carrega DOIS Set-Cookie (access_token e refresh_token).
  // `headers.get('set-cookie')` colapsaria os dois numa string concatenada e inválida
  // (perde a estrutura) — getSetCookie() preserva cada cookie como entrada separada do
  // array. Suportado pelo runtime fetch do Node usado pelo Next.js nesta versão
  // (Node 18.14+ / undici) — confirmado no fetch nativo do Node usado por este projeto.
  const setCookieHeaders =
    typeof refreshResponse.headers.getSetCookie === 'function'
      ? refreshResponse.headers.getSetCookie()
      : ((refreshResponse.headers as unknown as { raw?: () => Record<string, string[]> }).raw?.()[
          'set-cookie'
        ] ?? []);

  for (const cookie of setCookieHeaders) {
    redirectResponse.headers.append('Set-Cookie', cookie);
  }

  return redirectResponse;
}

// Guarda contra open-redirect: só aceita caminho relativo começando com uma única "/"
// (rejeita "//evil.com", que o browser trata como protocol-relative pro host errado, e
// rejeita URLs absolutas tipo "https://evil.com").
function isSafeRelativePath(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}
