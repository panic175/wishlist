import axios from 'axios';
import * as cheerio from 'cheerio';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

export async function fetchHtml(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function loadDocument(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

/**
 * Extract price from text (e.g., "$99.99", "99,99 €", "£50", "1.234,56 €")
 *
 * Handles both decimal-point (US/UK) and decimal-comma (German/EU) formats by
 * treating the last separator as the decimal separator when both appear, and a
 * trailing two-digit comma as a decimal comma otherwise.
 */
export function extractPrice(text: string): { price: number | null; currency: string | null } {
  const normalized = text.trim().replace(/\s+/g, '');

  const hasDollar = normalized.includes('$');
  const hasEuro = normalized.includes('€');
  const hasPound = normalized.includes('£');

  let currency = 'USD';
  if (hasEuro) currency = 'EUR';
  else if (hasPound) currency = 'GBP';
  else if (hasDollar) currency = 'USD';
  else if (normalized.match(/(^|[^a-z])EUR([^a-z]|$)/i)) currency = 'EUR';
  else if (normalized.match(/(^|[^a-z])GBP([^a-z]|$)/i)) currency = 'GBP';
  else if (normalized.match(/(^|[^a-z])USD([^a-z]|$)/i)) currency = 'USD';

  const cleaned = normalized
    .replace(/[€£$]/g, '')
    .replace(/\b(USD|EUR|GBP|CHF|CAD|AUD|JPY)\b/gi, '')
    .trim();

  const match = cleaned.match(/\d[\d.,\s]*/);
  if (!match) return { price: null, currency: null };

  const num = match[0];
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');

  let normalizedNum: string;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalizedNum = num.replace(/\./g, '').replace(',', '.');
    } else {
      normalizedNum = num.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const parts = num.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      normalizedNum = `${parts[0]}.${parts[1]}`;
    } else {
      normalizedNum = num.replace(/,/g, '');
    }
  } else {
    normalizedNum = num;
  }

  const price = parseFloat(normalizedNum);
  if (Number.isNaN(price)) return { price: null, currency: null };

  return { price, currency };
}

interface JsonLdProduct {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
}

/**
 * Find a schema.org Product node inside `application/ld+json` blocks and pull
 * out its name, description, offers price/currency and image.
 */
export function extractJsonLdProduct($: cheerio.CheerioAPI): JsonLdProduct | null {
  const result: JsonLdProduct = {
    title: null,
    description: null,
    price: null,
    currency: null,
    imageUrl: null,
  };

  const visit = (node: unknown): void => {
    if (result.title !== null && result.price !== null) return;
    if (!node || typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;
    const typeOf = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
    const isProduct = typeOf.some(
      (t) => typeof t === 'string' && t.toLowerCase().includes('product')
    );

    if (isProduct) {
      if (typeof obj.name === 'string' && result.title === null) result.title = obj.name;
      if (typeof obj.description === 'string' && result.description === null) {
        result.description = obj.description;
      }

      const image = obj.image;
      if (result.imageUrl === null) {
        if (typeof image === 'string') result.imageUrl = image;
        else if (Array.isArray(image)) {
          const first = image.find((i) => typeof i === 'string');
          if (typeof first === 'string') result.imageUrl = first;
        }
      }

      const offers = obj.offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer && typeof offer === 'object') {
        const offerObj = offer as Record<string, unknown>;
        if (result.price === null && (typeof offerObj.price === 'number' || typeof offerObj.price === 'string')) {
          result.price = parseFloat(String(offerObj.price));
        }
        if (typeof offerObj.priceCurrency === 'string' && result.currency === null) {
          result.currency = offerObj.priceCurrency;
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@')) continue;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (value && typeof value === 'object') {
        visit(value);
      }
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || '';
    if (!raw.includes('Product')) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) visit(item);
      } else if (data && typeof data === 'object' && '@graph' in data) {
        visit((data as Record<string, unknown>)['@graph']);
      } else {
        visit(data);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  if (result.title === null && result.price === null && result.imageUrl === null) {
    return null;
  }
  return result;
}