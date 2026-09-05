import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

/**
 * Geizhals (geizhals.de / .at / .eu / .co.uk) price-comparison product pages.
 * Uses the <h1> title, the `.gh_price` price cell (German/EU comma decimals)
 * and Open Graph image/description meta tags.
 */
export const geizhalsScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('geizhals.');
  },

  scrape($, url): ScrapedData {
    const title = $('h1').first().text().trim() || null;
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    let price: number | null = null;
    let currency: string | null = null;

    const priceSelectors = ['.gh_price', '.price', '[data-price]'];
    for (const selector of priceSelectors) {
      const priceText = $(selector).first().text();
      if (priceText) {
        const extracted = extractPrice(priceText);
        if (extracted.price !== null) {
          price = extracted.price;
          currency = extracted.currency;
          break;
        }
      }
    }

    const imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      null;

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