import { Response } from 'express';
import { AuthTokens } from './types/auth-tokens.type';

const isProduction = process.env.NODE_ENV === 'production';

// `secure: isProduction` (não sempre `true`) porque o ambiente de dev local roda em
// HTTP puro entre :3000 (web) e :3001 (api) — um cookie sempre `secure` seria
// descartado pelo navegador antes mesmo de chegar no frontend.
export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: tokens.refreshTokenExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}
