import type * as cheerio from 'cheerio';

export interface ScrapedData {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  url: string;
}

export interface Scraper {
  matches(hostname: string): boolean;
  scrape($: cheerio.CheerioAPI, url: string): ScrapedData;
}