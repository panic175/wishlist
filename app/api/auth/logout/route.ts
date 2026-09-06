import { NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully'
  });

  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');

  return response;
}
