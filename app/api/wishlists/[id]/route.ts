import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, wishlists } from '@/lib/db';
import { verifyAccessToken } from '@/lib/auth/utils';
import { validateSlug, validateHttpUrl } from '@/lib/validation';
import { csrfGuard } from '@/lib/csrf';
import { parseJsonBody } from '@/lib/request';

export async function GET(
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

    const { id } = await params;

    const wishlist = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.id, id))
      .limit(1);

    if (wishlist.length === 0) {
      return NextResponse.json(
        { error: 'Wishlist not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      wishlist: wishlist[0],
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wishlist' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

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

    const { id } = await params;
    const body = (await parseJsonBody<{ name?: string; slug?: string; description?: string; imageUrl?: string; isPublic?: boolean }>(request)) ?? {};
    const { name, slug, description, imageUrl, isPublic } = body;

    // Check if wishlist exists
    const existingWishlist = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.id, id))
      .limit(1);

    if (existingWishlist.length === 0) {
      return NextResponse.json(
        { error: 'Wishlist not found' },
        { status: 404 }
      );
    }

    // Validate new slug before checking availability
    if (slug !== undefined && slug !== existingWishlist[0].slug) {
      const slugError = validateSlug(slug);
      if (slugError) {
        return NextResponse.json({ error: slugError }, { status: 400 });
      }

      const slugExists = await db
        .select()
        .from(wishlists)
        .where(eq(wishlists.slug, slug))
        .limit(1);

      if (slugExists.length > 0) {
        return NextResponse.json(
          { error: 'A wishlist with this slug already exists' },
          { status: 409 }
        );
      }
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (imageUrl !== undefined) {
      const imageError = validateHttpUrl(imageUrl);
      if (imageError) {
        return NextResponse.json({ error: imageError }, { status: 400 });
      }
      updateData.imageUrl = imageUrl;
    }
    if (isPublic !== undefined) updateData.isPublic = isPublic;

    // Update wishlist
    const updatedWishlist = await db
      .update(wishlists)
      .set(updateData)
      .where(eq(wishlists.id, id))
      .returning();

    return NextResponse.json({
      success: true,
      wishlist: updatedWishlist[0],
    });
  } catch (error) {
    console.error('Error updating wishlist:', error);
    return NextResponse.json(
      { error: 'Failed to update wishlist' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

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

    const { id } = await params;

    // Check if wishlist exists
    const existingWishlist = await db
      .select()
      .from(wishlists)
      .where(eq(wishlists.id, id))
      .limit(1);

    if (existingWishlist.length === 0) {
      return NextResponse.json(
        { error: 'Wishlist not found' },
        { status: 404 }
      );
    }

    // Delete wishlist (cascade will delete items automatically)
    await db
      .delete(wishlists)
      .where(eq(wishlists.id, id));

    return NextResponse.json({
      success: true,
      message: 'Wishlist deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting wishlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete wishlist' },
      { status: 500 }
    );
  }
}
