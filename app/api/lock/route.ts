import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, settings } from '@/lib/db';
import crypto from 'crypto';
import { isSecureCookie } from '@/lib/auth/utils';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';

const LOCK_WINDOW_MS = 60 * 1000;
const LOCK_MAX_ATTEMPTS = 10;

// POST /api/lock - Verify password
export async function POST(request: NextRequest) {
  try {
    // Brute-force protection: 10 attempts per minute per client IP.
    const ip = getClientIp(request);
    const limit = rateLimit(`lock:${ip}`, LOCK_MAX_ATTEMPTS, LOCK_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Get the stored password hash
    const hashSetting = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'passwordLockHash'))
      .limit(1);

    if (hashSetting.length === 0) {
      return NextResponse.json(
        { error: 'Password lock not configured' },
        { status: 400 }
      );
    }

    // Hash the provided password
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    // Compare hashes
    if (hash === hashSetting[0].value) {
      // Password correct - set a cookie
      const response = NextResponse.json({
        success: true,
        message: 'Password verified',
      });

      // Readable by client components so PasswordLockGuard can bypass the
      // redirect after the site has been unlocked. It is a non-secret flag.
      response.cookies.set('site_unlocked', 'true', {
        httpOnly: false,
        secure: isSecureCookie(request),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}
