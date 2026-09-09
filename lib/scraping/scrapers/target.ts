import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

export const targetScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('target.com');
  },

  scrape($, url): ScrapedData {
    const title =
      $('h1[data-test="product-title"]').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      null;

    const description =
      $('div[data-test="item-details-description"]').text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      null;

    let price: number | null = null;
    let currency = 'USD';

    const priceText =
      $('span[data-test="product-price"]').first().text() ||
      $('div[data-test="product-price"]').first().text();

    if (priceText) {
      const extracted = extractPrice(priceText);
      price = extracted.price;
      currency = extracted.currency || 'USD';
    }

    const imageUrl =
      $('img[data-test="product-image"]').attr('src') ||
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