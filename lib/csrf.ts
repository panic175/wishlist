import { NextRequest, NextResponse } from 'next/server';

/**
 * CSRF defense for cookie-authenticated mutating endpoints.
 *
 * State-changing routes are gated with `csrfGuard()`. Forged cross-origin
 * form submissions and `<img>/<script>` auto-requests can carry cookies but
 * cannot set custom headers; they are always flagged by the browser with a
 * `Sec-Fetch-Site: cross-site` (or a foreign `Origin`) header on the request.
 * Non-browser clients and user-initiated navigations send no such headers and
 * are permitted.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    return (
      secFetchSite === 'same-origin' ||
      secFetchSite === 'same-site' ||
      secFetchSite === 'none'
    );
  }

  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return true;

  const host = request.headers.get('host');
  if (!host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Returns a 403 response for cross-origin requests, or null to allow.
 * Use at the top of POST/PATCH/PUT/DELETE handlers:
 *   const csrf = csrfGuard(request);
 *   if (csrf) return csrf;
 */
export function csrfGuard(request: NextRequest): NextResponse | null {
  if (isSameOrigin(request)) return null;
  return NextResponse.json(
    { error: 'Request blocked by cross-origin protection' },
    { status: 403 }
  );
}