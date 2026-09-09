import { generateAccessToken, generateRefreshToken, isSecureCookie } from './utils';

const AUTHELIA_ENABLED = process.env.AUTHELIA_ENABLED === 'true';

type CookieSecureRequest = { headers: { get(name: string): string | null }; url: string };

export function isAutheliaEnabled(): boolean {
  return AUTHELIA_ENABLED;
}

/**
 * Header the reverse proxy injects with the Authelia-authenticated username.
 * Configurable so deployments can override the default forward-auth header.
 */
export function getAutheliaUserHeader(): string {
  return process.env.AUTHELIA_USER_HEADER || 'X-Forwarded-User';
}

/**
 * Return the Authelia-authenticated user when the app runs behind Authelia
 * forward-auth, or null when disabled / header missing.
 */
export function getAutheliaUser(headers: { get(name: string): string | null }): string | null {
  if (!AUTHELIA_ENABLED) return null;
  const value = headers.get(getAutheliaUserHeader());
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Mint an app session (JWT tokens + cookie options) for a user established by
 * the Authelia forward-auth proxy. Cookie options mirror the legacy login route.
 */
export function createAutheliaSession(user: string, request: CookieSecureRequest) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const base = {
    httpOnly: true,
    secure: isSecureCookie(request),
    sameSite: 'lax' as const,
    path: '/',
  };

  return {
    accessToken,
    refreshToken,
    accessCookieOptions: { ...base, maxAge: 72 * 60 * 60 },
    refreshCookieOptions: { ...base, maxAge: 30 * 24 * 60 * 60 },
  };
}