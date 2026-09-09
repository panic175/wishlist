import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db, wishlistItems, wishlists } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';
import { parseCSV } from '@/lib/csv';

function columnIndex(header: string[], name: string): number {
  return header.indexOf(name);
}

function parseBool(value: string | undefined): boolean {
  const v = (value || '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

function parseNumber(value: string | undefined, fallback: number | null): number | null {
  const v = (value || '').trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(
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

  const body = await request.json().catch(() => null);
  const csv: unknown = body?.csv;

  if (typeof csv !== 'string' || !csv.trim()) {
    return NextResponse.json({ error: 'CSV content is required' }, { status: 400 });
  }

  const rows = parseCSV(csv);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: 'CSV must contain a header row and at least one item' },
      { status: 400 }
    );
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => columnIndex(header, name);

  const nameColumn = col('name');
  if (nameColumn === -1) {
    return NextResponse.json(
      { error: 'CSV is missing the required "name" column' },
      { status: 400 }
    );
  }

  const lastItem = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.wishlistId, id))
    .orderBy(desc(wishlistItems.sortOrder))
    .limit(1);
  const baseSortOrder = lastItem.length > 0 ? lastItem[0].sortOrder + 1 : 0;

  const values: Array<typeof wishlistItems.$inferInsert> = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => cell.trim() !== '')) return;

    const name = (row[nameColumn] || '').trim();
    if (!name) return;

    const purchaseUrlsRaw = col('purchase_urls') >= 0 ? (row[col('purchase_urls')] || '').trim() : '';
    let purchaseUrls: Array<{
      label: string;
      url: string;
      price?: number | null;
      currency?: string;
      imageUrl?: string | null;
    }> | null = null;
    if (purchaseUrlsRaw) {
      try {
        const parsed = JSON.parse(purchaseUrlsRaw);
        if (Array.isArray(parsed)) {
          purchaseUrls = parsed.filter(
            (entry) =>
              entry && typeof entry === 'object' && typeof entry.label === 'string' && typeof entry.url === 'string'
          );
        }
      } catch {
        // ignore malformed JSON and import the rest of the row
      }
    }

    values.push({
      wishlistId: id,
      name,
      description: col('description') >= 0 ? (row[col('description')] || '').trim() || null : null,
      price: parseNumber(col('price') >= 0 ? row[col('price')] : undefined, null),
      currency:
        (col('currency') >= 0 ? (row[col('currency')] || '').trim() || 'USD' : 'USD'),
      quantity: parseNumber(col('quantity') >= 0 ? row[col('quantity')] : undefined, 1) ?? 1,
      imageUrl: col('image_url') >= 0 ? (row[col('image_url')] || '').trim() || null : null,
      purchaseUrls,
      isArchived: parseBool(col('is_archived') >= 0 ? row[col('is_archived')] : undefined),
      isPurchased: parseBool(col('is_purchased') >= 0 ? row[col('is_purchased')] : undefined),
      claimedByName: col('claimed_by_name') >= 0 ? (row[col('claimed_by_name')] || '').trim() || null : null,
      claimedByNote: col('claimed_by_note') >= 0 ? (row[col('claimed_by_note')] || '').trim() || null : null,
      sortOrder: baseSortOrder + index,
    });
  });

  if (values.length === 0) {
    return NextResponse.json({ error: 'No importable items found in CSV' }, { status: 400 });
  }

  await db.insert(wishlistItems).values(values);

  return NextResponse.json({
    success: true,
    created: values.length,
    skipped: rows.length - 1 - values.length,
  });
}