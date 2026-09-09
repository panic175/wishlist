import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlistItems, wishlists } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';
import { toCSV } from '@/lib/csv';

const CSV_HEADERS = [
  'name',
  'description',
  'price',
  'currency',
  'quantity',
  'image_url',
  'purchase_urls',
  'is_archived',
  'is_purchased',
  'claimed_by_name',
  'claimed_by_note',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { id } = await params;

  const wishlist = await db
    .select()
    .from(wishlists)
    .where(eq(wishlists.id, id))
    .limit(1);

  if (wishlist.length === 0) {
    return NextResponse.json({ error: 'Wishlist not found' }, { status: 404 });
  }

  const items = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, id))
    .orderBy(wishlistItems.sortOrder);

  const rows: (string | number | boolean | null)[][] = [CSV_HEADERS];
  for (const item of items) {
    rows.push([
      item.name,
      item.description ?? '',
      item.price !== null && item.price !== undefined ? String(item.price) : '',
      item.currency,
      item.quantity,
      item.imageUrl ?? '',
      item.purchaseUrls ? JSON.stringify(item.purchaseUrls) : '',
      item.isArchived ? 'true' : 'false',
      item.isPurchased ? 'true' : 'false',
      item.claimedByName ?? '',
      item.claimedByNote ?? '',
    ]);
  }

  const csv = '\uFEFF' + toCSV(rows);
  const filename = `wishlist-${wishlist[0].slug}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}