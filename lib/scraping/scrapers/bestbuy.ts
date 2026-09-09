import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

export const bestBuyScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('bestbuy.com');
  },

  scrape($, url): ScrapedData {
    const title =
      $('h1.heading-5').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      null;

    const description =
      $('div.shop-product-description').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      null;

    let price: number | null = null;
    let currency = 'USD';

    const priceText =
      $('div[data-testid="customer-price"] span').first().text() ||
      $('.priceView-hero-price span').first().text();

    if (priceText) {
      const extracted = extractPrice(priceText);
      price = extracted.price;
      currency = extracted.currency || 'USD';
    }

    const imageUrl =
      $('img.primary-image').first().attr('src') ||
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