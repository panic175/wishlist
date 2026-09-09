import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, settings } from '@/lib/db';
import crypto from 'crypto';
import { isSecureCookie } from '@/lib/auth/utils';
import { verifyPassword } from '@/lib/auth/password';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';
import { csrfGuard } from '@/lib/csrf';
import { parseJsonBody } from '@/lib/request';

const LOCK_WINDOW_MS = 60 * 1000;
const LOCK_MAX_ATTEMPTS = 10;

// POST /api/lock - Verify password
export async function POST(request: NextRequest) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    // Brute-force protection: 10 attempts per minute per client IP.
    const ip = getClientIp(request);
    const limit = rateLimit(`lock:${ip}`, LOCK_MAX_ATTEMPTS, LOCK_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    const body = await parseJsonBody<{ password?: string }>(request);
    const { password } = body || {};

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

    const storedHash = hashSetting[0].value;

    // Verify against the stored hash. New hashes are scrypt; legacy rows may
    // still hold the old unsalted SHA-256 digest (verified here so existing
    // deployments keep working until the next password change).
    let isValid: boolean;
    if (storedHash.startsWith('scrypt$')) {
      isValid = verifyPassword(password, storedHash);
    } else {
      const legacy = crypto.createHash('sha256').update(password).digest('hex');
      const legacyBuffer = Buffer.from(legacy, 'hex');
      const storedBuffer = Buffer.from(storedHash, 'hex');
      isValid =
        legacyBuffer.length === storedBuffer.length &&
        legacyBuffer.length === 32 &&
        crypto.timingSafeEqual(legacyBuffer, storedBuffer);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      );
    }

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
  } catch (error) {
    console.error('Error verifying password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}
