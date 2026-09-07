import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Só checa a PRESENÇA do cookie — não valida a assinatura do JWT (desnecessário e
// mais caro aqui). É uma otimização de UX (evita renderizar a página pra só depois
// redirecionar); a verificação real acontece a cada chamada à API (ver lib/auth.ts),
// que tem seu próprio JwtAuthGuard. Ver docs/superpowers/specs/2026-09-04-auth-module-design.md, seção 7.
//
// access_token expira em 15min (maxAge = TTL do JWT, ver cookie.util.ts) e some do
// cookie jar sozinho quando isso acontece — mas o refresh_token dura 7 dias. Sem esse
// terceiro caminho, a dentista seria jogada pro /login a cada 15min de inatividade
// mesmo com sessão válida. Em vez de redirecionar direto pro /login quando falta só o
// access_token, manda pra uma Route Handler (runtime Node, não Edge — só ela consegue
// fazer POST /auth/refresh e replicar os Set-Cookie da API numa resposta de redirect)
// que tenta renovar a sessão silenciosamente antes de desistir.
export function proxy(request: NextRequest) {
  if (request.cookies.has('access_token')) {
    return NextResponse.next();
  }

  if (request.cookies.has('refresh_token')) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const refreshUrl = new URL('/api/refresh-and-continue', request.url);
    refreshUrl.searchParams.set('next', next);
    return NextResponse.redirect(refreshUrl);
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
