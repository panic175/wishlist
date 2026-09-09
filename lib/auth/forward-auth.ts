import { generateAccessToken, generateRefreshToken, isSecureCookie } from './utils';

// Forward-auth is a generic, provider-agnostic mechanism: the reverse proxy
// authenticates the request with any identity provider (Authelia, Keycloak,
// Authentik, Ory, ...) and injects the verified username into a header that
// this app converts into its own session. No provider-specific logic lives here.
//
// The `AUTHELIA_*` names are kept as deprecated aliases so existing
// deployments keep working.

type CookieSecureRequest = { headers: { get(name: string): string | null }; url: string };

/**
 * Forward-auth is on when FORWARD_AUTH_ENABLED=true, or (deprecated alias)
 * when AUTHELIA_ENABLED=true. A set FORWARD_AUTH_ENABLED wins; an empty value
 * (e.g. an unset compose passthrough) is treated as unset so the alias still
 * applies.
 */
export function isForwardAuthEnabled(): boolean {
  const enabled = process.env.FORWARD_AUTH_ENABLED;
  if (enabled) return enabled === 'true';
  return process.env.AUTHELIA_ENABLED === 'true';
}

/**
 * Header the reverse proxy injects with the provider-authenticated username.
 * Must match what your proxy's forward-auth middleware is configured to inject
 * (e.g. Authelia/Keycloak/Authentik `authResponseHeaders`). Default
 * `X-Forwarded-User`.
 */
export function getForwardAuthUserHeader(): string {
  return (
    process.env.FORWARD_AUTH_USER_HEADER ||
    process.env.AUTHELIA_USER_HEADER ||
    'X-Forwarded-User'
  );
}

/**
 * Human-readable provider name shown on the admin login page (e.g. "Keycloak",
 * "Authentik"). Defaults to "SSO" so the button reads "Continue with SSO" when
 * no provider is named.
 */
export function getForwardAuthProviderName(): string {
  return process.env.FORWARD_AUTH_PROVIDER_NAME || 'SSO';
}

/**
 * Portal URL shown on the admin login page as the sign-in link.
 */
export function getForwardAuthPortalUrl(): string | undefined {
  return process.env.FORWARD_AUTH_PORTAL_URL || process.env.AUTHELIA_PORTAL_URL;
}

/**
 * Return the provider-authenticated user when the app runs behind a
 * forward-auth proxy, or null when disabled / header missing.
 *
 * The identity header is ONLY honored over a TLS-terminated connection. A
 * plain-HTTP request with a forged header must never mint a session. The
 * reverse proxy is still required to strip client-supplied copies of the
 * header (see DEPLOYMENT.md) - this check is defence in depth.
 */
export function getForwardAuthUser(request: {
  headers: { get(name: string): string | null };
  url: string;
}): string | null {
  if (!isForwardAuthEnabled()) return null;
  if (!isSecureCookie(request)) return null;
  const value = request.headers.get(getForwardAuthUserHeader());
  if (!value || !value.trim()) return null;
  return value.trim();
}

/**
 * Mint an app session (JWT tokens + cookie options) for a user established by
 * the forward-auth proxy. Cookie options mirror the legacy login route.
 */
export function createForwardAuthSession(user: string, request: CookieSecureRequest) {
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
