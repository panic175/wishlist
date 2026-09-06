import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, generateRefreshToken, validateAdminCredentials, isSecureCookie } from '@/lib/auth/utils';
import { isAutheliaEnabled } from '@/lib/auth/authelia';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';

const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    if (isAutheliaEnabled()) {
      return NextResponse.json(
        { error: 'Admin login is handled by Authelia' },
        { status: 403 }
      );
    }

    // Brute-force protection: 5 attempts per minute per client IP.
    const ip = getClientIp(request);
    const limit = rateLimit(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Validate credentials
    if (!validateAdminCredentials(username, password)) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken(username);
    const refreshToken = generateRefreshToken(username);

    // Create response
    const response = NextResponse.json({
      success: true,
      user: { username },
      accessToken,
      refreshToken,
    });

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      secure: isSecureCookie(request),
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 72 * 60 * 60, // 72 hours
    });

    response.cookies.set('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
