import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/utils';
import {
  createAutheliaSession,
  getAutheliaUser,
  getAutheliaUserHeader,
} from '@/lib/auth/authelia';

const isDev = process.env.NODE_ENV === 'development';

function buildCsp(nonce: string, isSecure: boolean): string {
  const contentSecurityPolicyHeaderValue = `default-src 'self';
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self'${isDev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`};
  img-src 'self' https:;
  font-src 'self';
  connect-src 'self';
  media-src 'none';
  worker-src 'none';
  frame-src 'none';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  manifest-src 'self'${!isDev && isSecure ? ';\n  upgrade-insecure-requests' : ''};`
    .replace(/\s{2,}/g, ' ')
    .trim();
  return contentSecurityPolicyHeaderValue;
}

/**
 * Attach a fresh per-request CSP nonce to the outgoing response.
 *
 * Next.js parses the CSP request header during server-side rendering and
 * applies the nonce to its framework scripts, page bundles and inline
 * scripts/styles automatically (see the Next.js "Content Security Policy"
 * guide). The same policy is mirrored on the response headers for the browser.
 */
function withNonce(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Only emit upgrade-insecure-requests on TLS-terminated connections; on a
  // plain-HTTP deployment it would force every same-origin resource to https
  // and break the site.
  const isSecure =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildCsp(nonce, isSecure);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

/**
 * Admin gate running on the Node.js runtime (Next.js 16 proxy).
 *
 * Also emits the nonce-based Content-Security-Policy for every rendered page.
 *
 * Maintains two identity sources:
 * 1. The app's own JWT session (access_token cookie) — used after the first
 *    Authelia handshake or in standalone (non-Authelia) deployments.
 * 2. Authelia forward-auth: when AUTHELIA_ENABLED=true, a trusted reverse
 *    proxy runs every /admin request through Authelia and injects the resolved
 *    user into AUTHELIA_USER_HEADER (default X-Forwarded-User). The proxy then
 *    provisions an app session from that header.
 *
 * Route handlers remain the enforcement layer (they 401 without a valid token);
 * this file only gates page navigation and boots the header→session handshake.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin gate — only meaningful under /admin (and /api/auth/me for the
  // Authelia handshake). Public wishlist/claim flows must stay open.
  const isAdminRoute = pathname.startsWith('/admin');
  const isAuthMe = pathname === '/api/auth/me';

  // The login page must render for unauthenticated users (legacy form or
  // after the Authelia portal redirects back) instead of looping, so the
  // anonymous case always passes through. The Authelia handshake below still
  // provisions a session when the trusted header is present, so the portal's
  // redirect back to /admin/login lands logged in and the app re-directs to
  // /admin.
  const isLogin = pathname === '/admin/login';

  if (isAdminRoute || isAuthMe) {
    // Existing valid session.
    const token = request.cookies.get('access_token')?.value;
    if (token && verifyAccessToken(token)) {
      return withNonce(request);
    }

    // Authelia forward-auth: convert the trusted header into an app session.
    const autheliaUser = getAutheliaUser(request);
    if (autheliaUser) {
      const session = createAutheliaSession(autheliaUser, request);

      // withNonce snapshots the outgoing request headers, so call it before
      // stripping the identity header: /api/auth/me bootstraps its own session
      // from X-Forwarded-User (it may be hit without the proxy having run) and
      // must still see it. Downstream page/handler processing sees the header
      // removed.
      const response = withNonce(request);
      request.headers.delete(getAutheliaUserHeader());

      response.cookies.set('access_token', session.accessToken, session.accessCookieOptions);
      response.cookies.set('refresh_token', session.refreshToken, session.refreshCookieOptions);
      return response;
    }

    if (isLogin || isAuthMe) {
      return withNonce(request);
    }

    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Every other page route (home, public wishlists, lock, ...) only needs the
  // nonce-based CSP.
  return withNonce(request);
}

export const config = {
  matcher: [
    /*
     * Run on page routes (so every rendered page gets a CSP nonce) but skip
     * static assets, API routes, uploads and prefetches which don't need it.
     * `/api/auth/me` is handled again below for the Authelia handshake.
     */
    {
      source: '/((?!api|_next/static|_next/image|uploads|favicon\\.ico|icon\\.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    '/api/auth/me',
  ],
};