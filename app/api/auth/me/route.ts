import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/utils';
import { createAutheliaSession, getAutheliaUser } from '@/lib/auth/authelia';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
      // Authelia forward-auth: bootstrap a session from the trusted header.
      // Covers client-side navigation, where the proxy may not have run.
      const autheliaUser = getAutheliaUser(request.headers);
      if (autheliaUser) {
        const session = createAutheliaSession(autheliaUser, request);
        const response = NextResponse.json({
          success: true,
          user: { username: autheliaUser },
        });
        response.cookies.set('access_token', session.accessToken, session.accessCookieOptions);
        response.cookies.set('refresh_token', session.refreshToken, session.refreshCookieOptions);
        return response;
      }

      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: { username: payload.username },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
