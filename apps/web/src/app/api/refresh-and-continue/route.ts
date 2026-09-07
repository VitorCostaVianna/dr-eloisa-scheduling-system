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
  const next = getSafeRedirectPath(requestedNext, request.url);

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

// Guarda contra open-redirect: valida o `next` contra a origem da requisição após parsing,
// não apenas um prefixo de string bruta. WHATWG URL parsing normaliza backslashes e
// caracteres de controle ANTES de resolver — um valor como "/\evil.com" que passaria
// num check de prefixo bruto é normalizado pelo parser pra "/evil.com", resultando
// em redirecionamento pra um domínio diferente. A solução: tentar parsear como URL
// absoluta com a origem da requisição como base, verificar se a origem resolvida
// bate com a nossa, e então usar o caminho+query+hash da URL parseada (não a string bruta).
function getSafeRedirectPath(value: string | null, requestUrl: string): string {
  if (!value) return '/dashboard';

  try {
    // Tentar parsear `value` como URL absoluta usando `requestUrl` como base.
    const parsed = new URL(value, requestUrl);
    // Extrair a origem da requisição do mesmo jeito.
    const requestOrigin = new URL(requestUrl).origin;

    // Se a origem parseada não bate com a origem da requisição, rejeitar.
    if (parsed.origin !== requestOrigin) {
      return '/dashboard';
    }

    // Se passou, usar pathname+search+hash (não a string bruta) pra garantir
    // que o que está sendo validado é exatamente o que está sendo redirecionado.
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // Se parsing falhar (URL malformada, etc), cair pro fallback.
    return '/dashboard';
  }
}
