import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, settings } from '@/lib/db';
import { verifyAccessToken } from './utils';

/**
 * Server-side site-lock enforcement.
 *
 * The unlock flag had only ever been enforced client-side; this helper lets
 * public data endpoints refuse to serve content while the site is locked,
 * so the password lock is a real (if lightweight) privacy boundary.
 */

export async function isLockEnabled(): Promise<boolean> {
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'passwordLockEnabled'))
    .limit(1);

  return rows.length > 0 && rows[0].value === 'true';
}

export function isSiteUnlocked(request: NextRequest): boolean {
  return request.cookies.get('site_unlocked')?.value === 'true';
}

/**
 * Return a 403 response when the site is locked and the visitor has neither
 * unlocked it nor is a logged-in admin. Returns null when access is allowed.
 */
export async function requireSiteUnlocked(request: NextRequest): Promise<Response | null> {
  if (!(await isLockEnabled())) return null;

  if (isSiteUnlocked(request)) return null;

  // Authenticated admins bypass the visitor lock.
  const adminToken = request.cookies.get('access_token')?.value;
  if (adminToken && verifyAccessToken(adminToken)) return null;

  return NextResponse.json(
    { error: 'Site is password protected' },
    { status: 403 }
  );
}