/**
 * Server-side input validation helpers.
 */

// Route paths that take priority over public wishlist slugs. These are
// reserved so a wishlist slug can never shadow an app route (which would
// break the admin UI or the API).
const RESERVED_SLUGS = new Set([
  'admin',
  'lock',
  'login',
  'health',
  'api',
  'uploads',
  '_next',
  '_error',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Returns a human-readable reason when `slug` is invalid, otherwise null.
 * Slugs must be lowercase kebab-case (`a-z0-9` with `-` separators, no
 * leading/trailing/consecutive hyphens) and must not collide with app routes.
 */
export function validateSlug(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return 'Slug is required';
  }
  if (slug.length > 80) {
    return 'Slug must be 80 characters or fewer';
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug may only contain lowercase letters, numbers, and single hyphens';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return 'This slug is reserved';
  }
  return null;
}

/**
 * Accepts only http:/https: URLs (no javascript:, data:, vbscript:, etc.)
 * Used for user-supplied links so a crafted URL cannot become an XSS vector
 * when rendered into an href/src. Returns null when valid.
 */
export function validateHttpUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return 'URL must be a string';
  }
  if (value.length > 2048) {
    return 'URL is too long';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'URL must use http or https';
    }
    if (!parsed.hostname) {
      return 'URL must include a hostname';
    }
    return null;
  } catch {
    return 'Invalid URL';
  }
}

/**
 * Validates every purchase-URL entry in an item payload. Each entry is
 * `{ label, url, price?, currency?, imageUrl? }`; the `url` and optional
 * `imageUrl` must be http(s).
 * Returns a reason string for the first offending entry, or null if all pass.
 */
export function validatePurchaseUrls(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return 'purchase urls must be an array';
  }
  if (value.length > 20) {
    return 'Too many purchase links (max 20)';
  }
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return 'Invalid purchase url entry';
    }
    const { url, imageUrl } = entry as Record<string, unknown>;
    const urlError = validateHttpUrl(url);
    if (urlError) {
      return `Invalid purchase url: ${urlError}`;
    }
    const imageError = validateHttpUrl(imageUrl);
    if (imageError) {
      return `Invalid purchase image url: ${imageError}`;
    }
  }
  return null;
}