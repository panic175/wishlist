import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

export const walmartScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('walmart.com');
  },

  scrape($, url): ScrapedData {
    const title =
      $('h1[itemprop="name"]').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      null;

    const description =
      $('div[itemprop="description"]').text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      null;

    let price: number | null = null;
    let currency = 'USD';

    const priceText =
      $('span[itemprop="price"]').first().attr('content') ||
      $('span[itemprop="price"]').first().text() ||
      $('.price-characteristic').first().text();

    if (priceText) {
      const extracted = extractPrice(priceText);
      price = extracted.price;
      currency = extracted.currency || 'USD';
    }

    const imageUrl =
      $('img[itemprop="image"]').attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
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