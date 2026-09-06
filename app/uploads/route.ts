import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { verifyAccessToken } from '@/lib/auth/utils';
import { rateLimit, getClientIp, tooManyRequestsResponse } from '@/lib/rate-limit';

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PIXELS = 20 * 1000 * 1000; // ~20MP input decode cap (decompression-bomb guard)
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

// Resize configuration
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;
const QUALITY = 85;

const UPLOAD_WINDOW_MS = 60 * 1000;
const UPLOAD_MAX_REQUESTS = 10;

export async function POST(request: NextRequest) {
  try {
    // Uploads mutate server storage: require an admin session.
    const token = request.cookies.get('access_token')?.value;
    if (!token || !verifyAccessToken(token)) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Bound the rate of concurrent uploads.
    const ip = getClientIp(request);
    const limit = rateLimit(`upload:${ip}`, UPLOAD_MAX_REQUESTS, UPLOAD_WINDOW_MS);
    if (!limit.allowed) {
      return tooManyRequestsResponse(limit.resetAt - Date.now());
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'wishlist' or 'item'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Create upload directory if it doesn't exist
    const typeDir = path.join(UPLOAD_DIR, type === 'wishlist' ? 'wishlists' : 'items');
    if (!existsSync(typeDir)) {
      // Create directory with 0775 permissions (rwxrwxr-x)
      await mkdir(typeDir, { recursive: true, mode: 0o775 });
    }

    // Generate unique filename (always use .webp for output)
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(6).toString('hex');
    const filename = `${timestamp}-${randomPart}.webp`;
    const filepath = path.join(typeDir, filename);

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Resize and optimize image. limitInputPixels caps the decode size so a
    // small encoded file that expands to huge dimensions is rejected.
    const processedImage = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer();

    // Save processed image with proper permissions (0664 = rw-rw-r--)
    // This respects the umask setting and ensures proper group access
    await writeFile(filepath, processedImage, { mode: 0o664 });

    console.log(`Uploaded file: ${filepath}`);

    // Return the public URL (served from /uploads route)
    const publicUrl = `/uploads/${type === 'wishlist' ? 'wishlists' : 'items'}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
