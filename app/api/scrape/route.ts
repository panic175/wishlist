import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/utils';
import { scrapeUrl } from '@/lib/scraping';
import { isHttpUrl } from '@/lib/scraping/ssrf';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
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

    const body = await request.json();
    const { url } = body;

    // Validation
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format (schemes restricted to http/https)
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    if (!isHttpUrl(normalizedUrl)) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Scrape the URL
    const scrapedData = await scrapeUrl(url);

    return NextResponse.json({
      success: true,
      data: scrapedData,
    });
  } catch (error) {
    console.error('Error scraping URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to scrape URL',
      },
      { status: 500 }
    );
  }
}
