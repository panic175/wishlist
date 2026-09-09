import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/utils';
import {
  createForwardAuthSession,
  getForwardAuthUser,
  getForwardAuthUserHeader,
} from '@/lib/auth/forward-auth';

/**
 * Admin gate running on the Node.js runtime (Next.js 16 proxy).
 *
 * Maintains two identity sources:
 * 1. The app's own JWT session (access_token cookie) — used after the first
 *    forward-auth handshake or in standalone deployments.
 * 2. Forward-auth: when FORWARD_AUTH_ENABLED=true, a trusted reverse proxy
 *    runs every /admin request through an identity provider (Authelia,
 *    Keycloak, Authentik, ...) and injects the resolved user into
 *    FORWARD_AUTH_USER_HEADER (default X-Forwarded-User). The proxy then
 *    provisions an app session from that header.
 *
 * Route handlers remain the enforcement layer (they 401 without a valid token);
 * this file only gates page navigation and boots the header→session handshake.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page must render for unauthenticated users (legacy form or
  // after the provider portal redirects back) instead of looping, so the
  // anonymous case always passes through. The forward-auth handshake below
  // still provisions a session when the trusted header is present, so the
  // portal's redirect back to /admin/login lands logged in and the app
  // re-directs to /admin.
  const isLogin = pathname === '/admin/login';

  // Existing valid session.
  const token = request.cookies.get('access_token')?.value;
  if (token && verifyAccessToken(token)) {
    return NextResponse.next();
  }

  // Forward-auth: convert the trusted header into an app session.
  const forwardAuthUser = getForwardAuthUser(request);
  if (forwardAuthUser) {
    const session = createForwardAuthSession(forwardAuthUser, request);

    // Keep the injected identity header from leaking to downstream handlers.
    request.headers.delete(getForwardAuthUserHeader());

    const response = NextResponse.next();
    response.cookies.set('access_token', session.accessToken, session.accessCookieOptions);
    response.cookies.set('refresh_token', session.refreshToken, session.refreshCookieOptions);
    return response;
  }

  if (isLogin || pathname === '/api/auth/me') {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/api/auth/me'],
};
