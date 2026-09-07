import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Só checa a PRESENÇA do cookie — não valida a assinatura do JWT (desnecessário e
// mais caro aqui). É uma otimização de UX (evita renderizar a página pra só depois
// redirecionar); a verificação real acontece a cada chamada à API (ver lib/auth.ts),
// que tem seu próprio JwtAuthGuard. Ver docs/superpowers/specs/2026-09-04-auth-module-design.md, seção 7.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('access_token');

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
