import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken, generateRefreshToken, validateAdminCredentials, isSecureCookie } from '@/lib/auth/utils';
import { isAutheliaEnabled } from '@/lib/auth/authelia';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';
import { csrfGuard } from '@/lib/csrf';

const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    // Block cross-origin credential-stuffing/forged logins.
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

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

    // Create response. Tokens are only ever delivered as httpOnly cookies so
    // they are never readable by client JavaScript or logs.
    const response = NextResponse.json({
      success: true,
      user: { username },
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
      maxAge: 15 * 60, // 15 minutes
    });

    response.cookies.set('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
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
