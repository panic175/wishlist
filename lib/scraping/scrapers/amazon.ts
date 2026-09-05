import type { Scraper, ScrapedData } from '../types';
import { extractPrice } from '../utils';

export const amazonScraper: Scraper = {
  matches(hostname) {
    return hostname.includes('amazon.');
  },

  scrape($, url): ScrapedData {
    const title =
      $('#productTitle').text().trim() ||
      $('span[id="productTitle"]').text().trim() ||
      null;

    const description =
      $('#feature-bullets ul li').first().text().trim() ||
      $('meta[name="description"]').attr('content') ||
      null;

    let price: number | null = null;
    let currency: string | null = null;

    const priceWhole = $('.a-price-whole').first().text().trim();
    const priceFraction = $('.a-price-fraction').first().text().trim();

    if (priceWhole) {
      const priceStr = priceWhole.replace(',', '') + (priceFraction || '00');
      price = parseFloat(priceStr);
      currency = 'USD';
    }

    if (price === null) {
      const priceSelectors = [
        '.a-price .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '.a-price-whole',
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

    const imageUrl =
      $('#landingImage').attr('src') ||
      $('#imgBlkFront').attr('src') ||
      $('img[data-old-hires]').attr('data-old-hires') ||
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