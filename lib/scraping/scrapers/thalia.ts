import type { Scraper, ScrapedData } from '../types';
import { extractJsonLdProduct, extractPrice } from '../utils';

function resolveUrl(value: string | undefined, pageUrl: string): string | null {
  if (!value) return null;

  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return value;
  }
}

/**
 * Thalia product pages. Prefer schema.org Product JSON-LD and fall back to
 * the visible product markup and Open Graph metadata.
 */
export const thaliaScraper: Scraper = {
  matches(hostname) {
    return hostname === 'thalia.de' || hostname.endsWith('.thalia.de');
  },

  scrape($, url): ScrapedData {
    const jsonLd = extractJsonLdProduct($);

    const title =
      jsonLd?.title ||
      $('[data-testid="product-title"]').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      null;

    const description =
      jsonLd?.description ||
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    let price = jsonLd?.price ?? null;
    let currency = jsonLd?.currency ?? null;

    if (price === null) {
      const priceText =
        $('[data-testid="product-price"]').first().text() ||
        $('[data-testid="price"]').first().text() ||
        $('.product-price').first().text() ||
        $('[itemprop="price"]').first().text();

      if (priceText) {
        const extracted = extractPrice(priceText);
        price = extracted.price;
        currency = extracted.currency;
      }
    }

    const imageUrl = resolveUrl(
      jsonLd?.imageUrl ||
        $('meta[property="og:image"]').attr('content') ||
        $('[data-testid="product-image"] img').first().attr('src') ||
        $('img[itemprop="image"]').first().attr('src') ||
        $('.product-image img').first().attr('src'),
      url
    );

    return {
      title,
      description,
      price,
      currency,
      imageUrl,
      url,
    };
  },
};
