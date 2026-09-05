import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

/**
 * Generic scraper using Open Graph and meta tags. Acts as the fallback
 * when no site-specific scraper matches the hostname.
 */
export const genericScraper: Scraper = {
  matches() {
    return true;
  },

  scrape($, url): ScrapedData {
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogPriceAmount = $('meta[property="og:price:amount"]').attr('content');
    const ogPriceCurrency = $('meta[property="og:price:currency"]').attr('content');

    const metaDescription = $('meta[name="description"]').attr('content');
    const title = ogTitle || $('title').text().trim() || null;
    const description = ogDescription || metaDescription || null;
    const imageUrl = ogImage || $('link[rel="image_src"]').attr('href') || null;

    let price: number | null = null;
    let currency: string | null = null;

    if (ogPriceAmount && ogPriceCurrency) {
      price = parseFloat(ogPriceAmount);
      currency = ogPriceCurrency;
    } else {
      const priceSelectors = [
        '.price',
        '[data-price]',
        '.product-price',
        '[itemprop="price"]',
        '.a-price .a-offscreen',
      ];

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
    }

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