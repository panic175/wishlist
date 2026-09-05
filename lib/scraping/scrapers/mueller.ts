import type { Scraper, ScrapedData } from '../types';
import { extractJsonLdProduct } from '../utils';

/**
 * Mueller (mueller.de) drugstore product pages. Prices are only exposed via
 * schema.org Product JSON-LD (offers[0].price / priceCurrency); fall back to
 * the <h1> title and Open Graph image when JSON-LD is missing.
 */
export const muellerScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('mueller.de');
  },

  scrape($, url): ScrapedData {
    const jsonLd = extractJsonLdProduct($);

    const title =
      jsonLd?.title || $('h1').first().text().trim() || null;
    const description =
      jsonLd?.description ||
      $('meta[name="description"]').attr('content') ||
      null;
    const imageUrl =
      jsonLd?.imageUrl ||
      $('meta[property="og:image"]').attr('content') ||
      null;

    return {
      title,
      description,
      price: jsonLd?.price ?? null,
      currency: jsonLd?.currency ?? null,
      imageUrl,
      url,
    };
  },
};