import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, isSecureCookie } from '@/lib/auth/utils';

export async function POST(request: NextRequest) {
  try {
    // Refresh tokens are only accepted from the httpOnly cookie, never from
    // the request body, so a leaked/replayed token cannot be used directly.
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(payload.username);
    const newRefreshToken = generateRefreshToken(payload.username);

    // Create response. Tokens are only delivered as httpOnly cookies.
    const response = NextResponse.json({
      success: true,
    });

    // Set new cookies
    const cookieOptions = {
      httpOnly: true,
      secure: isSecureCookie(request),
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('access_token', newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60, // 15 minutes
    });

    response.cookies.set('refresh_token', newRefreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 }
    );
  }
}
