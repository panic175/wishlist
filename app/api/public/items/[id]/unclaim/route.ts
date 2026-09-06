import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlistItems, wishlists } from '@/lib/db';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';
import { requireSiteUnlocked } from '@/lib/auth/lock';
import { safeEqualString } from '@/lib/auth/password';
import { csrfGuard } from '@/lib/csrf';

const UNCLAIM_WINDOW_MS = 60 * 1000;
const UNCLAIM_MAX_REQUESTS = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Block cross-origin (forged) unclaims.
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    // Prevent automated claim/unclaim flapping.
    const ip = getClientIp(request);
    const limit = rateLimit(`unclaim:${ip}`, UNCLAIM_MAX_REQUESTS, UNCLAIM_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    // Locked sites do not allow anonymous unclaims.
    const locked = await requireSiteUnlocked(request);
    if (locked) return locked;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const { claimToken } = body || {};

    if (typeof claimToken !== 'string' || claimToken.trim() === '') {
      return NextResponse.json(
        { error: 'Claim token is required' },
        { status: 400 }
      );
    }

    // Get the item
    const item = await db
      .select()
      .from(wishlistItems)
      .where(eq(wishlistItems.id, id))
      .limit(1);

    if (item.length === 0) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Check if item is actually claimed
    if (!item[0].claimedByToken) {
      return NextResponse.json(
        { error: 'Item is not claimed' },
        { status: 400 }
      );
    }

    // Only the claimant (holding the claim token) may unclaim.
    if (!safeEqualString(claimToken, item[0].claimedByToken)) {
      return NextResponse.json(
        { error: 'Invalid claim token' },
        { status: 403 }
      );
    }

    // Check if wishlist is public
    const wishlist = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.id, item[0].wishlistId))
      .limit(1);

    if (wishlist.length === 0) {
      return NextResponse.json(
        { error: 'Wishlist not found' },
        { status: 404 }
      );
    }

    if (!wishlist[0].isPublic) {
      return NextResponse.json(
        { error: 'This wishlist is private' },
        { status: 403 }
      );
    }

    // Remove claim information
    const updatedItem = await db
      .update(wishlistItems)
      .set({
        claimedByName: null,
        claimedByNote: null,
        claimedByToken: null,
        claimedAt: null,
        isPurchased: false,
        updatedAt: new Date(),
      })
      .where(eq(wishlistItems.id, id))
      .returning();

    return NextResponse.json(
      {
        success: true,
        message: 'Item unclaimed successfully',
        item: updatedItem[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error unclaiming item:', error);
    return NextResponse.json(
      { error: 'Failed to unclaim item' },
      { status: 500 }
    );
  }
}
