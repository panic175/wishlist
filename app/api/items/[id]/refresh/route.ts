import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlistItems } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';
import { scrapeUrl } from '@/lib/scraping';
import type { ScrapedData } from '@/lib/scraping';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';

const REFRESH_WINDOW_MS = 60 * 1000;
const REFRESH_MAX_REQUESTS = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Prevent resource exhaustion from concurrent/slow rescrapes.
    const ip = getClientIp(request);
    const limit = rateLimit(`refresh:${ip}`, REFRESH_MAX_REQUESTS, REFRESH_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    const { id } = await params;
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    const existingItem = await db
      .select()
      .from(wishlistItems)
      .where(eq(wishlistItems.id, id))
      .limit(1);

    if (existingItem.length === 0) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    const purchaseUrls = existingItem[0].purchaseUrls || [];
    const matchIndex = purchaseUrls.findIndex((entry) => entry.url === url);

    if (matchIndex === -1) {
      return NextResponse.json(
        { error: 'URL not found on item' },
        { status: 404 }
      );
    }

    const scraped: ScrapedData = await scrapeUrl(url);

    const updatedUrls = [...purchaseUrls];
    updatedUrls[matchIndex] = {
      ...updatedUrls[matchIndex],
      price: scraped.price ?? updatedUrls[matchIndex].price ?? null,
      currency: scraped.currency || updatedUrls[matchIndex].currency,
      imageUrl: scraped.imageUrl || updatedUrls[matchIndex].imageUrl || null,
    };

    // Item-level primary price follows the first URL entry, or fills in
    // when the item has no price yet.
    const refreshPrimary = matchIndex === 0 || existingItem[0].price === null;

    const updateData: Record<string, unknown> = {
      purchaseUrls: updatedUrls,
      updatedAt: new Date(),
    };

    if (refreshPrimary) {
      if (scraped.price !== null) updateData.price = scraped.price;
      if (scraped.currency) updateData.currency = scraped.currency;
      if (scraped.imageUrl) updateData.imageUrl = scraped.imageUrl;
    }

    const updatedItem = await db
      .update(wishlistItems)
      .set(updateData)
      .where(eq(wishlistItems.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      data: scraped,
      item: updatedItem[0],
    });
  } catch (error) {
    console.error('Error refreshing item URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh URL',
      },
      { status: 500 }
    );
  }
}