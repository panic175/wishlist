import { NextRequest, NextResponse } from 'next/server';

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
 * Per-request CSP nonce (Next.js 16 proxy, Node runtime).
 *
 * Every rendered page gets a fresh CSP nonce; static assets, API routes,
 * uploads and prefetches are skipped.
 */
export function proxy(request: NextRequest) {
  return withNonce(request);
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|uploads|favicon\\.ico|icon\\.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
