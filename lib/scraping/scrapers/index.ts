import type { Scraper } from '../types';
import { amazonScraper } from './amazon';
import { targetScraper } from './target';
import { walmartScraper } from './walmart';
import { bestBuyScraper } from './bestbuy';
import { genericScraper } from './generic';

export const scrapers: Scraper[] = [
  amazonScraper,
  targetScraper,
  walmartScraper,
  bestBuyScraper,
  genericScraper,
];

export { genericScraper } from './generic';