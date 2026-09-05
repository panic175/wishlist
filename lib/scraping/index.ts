import type { Scraper, ScrapedData } from './types';
export type { ScrapedData, Scraper } from './types';
export { fetchHtml, extractPrice } from './utils';
export { scrapers, genericScraper } from './scrapers';

import { scrapers } from './scrapers';
import { fetchHtml, loadDocument } from './utils';

/**
 * Main scrape function - normalizes the URL, fetches HTML once, then lets the
 * first matching scraper in the registry handle parsing. Falls back to the
 * generic scraper when no site-specific scraper matches.
 */
export async function scrapeUrl(url: string): Promise<ScrapedData> {
  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(normalizedUrl);
    const hostname = urlObj.hostname.toLowerCase();

    const html = await fetchHtml(normalizedUrl);
    const $ = loadDocument(html);

    const scraper: Scraper = scrapers.find((s) => s.matches(hostname)) ?? scrapers[scrapers.length - 1];

    return scraper.scrape($, normalizedUrl);
  } catch (error) {
    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}