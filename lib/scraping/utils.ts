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
 * Extract price from text (e.g., "$99.99", "99,99 €", "£50")
 */
export function extractPrice(text: string): { price: number | null; currency: string | null } {
  const normalized = text.trim().replace(/\s+/g, '');

  const patterns = [
    /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*USD/i,
    /€(\d+(?:\.\d{3})*(?:,\d{2})?)/,
    /£(\d+(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d+(?:,\d{3})*(?:\.\d{2})?)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseFloat(priceStr);

      if (!isNaN(price)) {
        let currency = 'USD';
        if (normalized.includes('$')) currency = 'USD';
        else if (normalized.includes('€')) currency = 'EUR';
        else if (normalized.includes('£')) currency = 'GBP';
        else if (normalized.match(/USD/i)) currency = 'USD';
        else if (normalized.match(/EUR/i)) currency = 'EUR';
        else if (normalized.match(/GBP/i)) currency = 'GBP';

        return { price, currency };
      }
    }
  }

  return { price: null, currency: null };
}