import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/utils';
import { createForwardAuthSession, getForwardAuthUser } from '@/lib/auth/forward-auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
      // Forward-auth: bootstrap a session from the trusted header.
      // Covers client-side navigation, where the proxy may not have run.
      const forwardAuthUser = getForwardAuthUser(request);
      if (forwardAuthUser) {
        const session = createForwardAuthSession(forwardAuthUser, request);
        const response = NextResponse.json({
          success: true,
          user: { username: forwardAuthUser },
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
