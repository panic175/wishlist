import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { verifyAccessToken } from '@/lib/auth/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token || !verifyAccessToken(token)) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  let version: string | null = null;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { version?: unknown };
    version = typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    version = null;
  }

  return NextResponse.json({
    success: true,
    version,
    commit: process.env.APP_COMMIT || null,
    buildTime: process.env.APP_BUILD_TIME || null,
  });
}