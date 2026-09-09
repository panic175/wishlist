import type { Scraper } from '../types';
import { amazonScraper } from './amazon';
import { targetScraper } from './target';
import { walmartScraper } from './walmart';
import { bestBuyScraper } from './bestbuy';
import { geizhalsScraper } from './geizhals';
import { muellerScraper } from './mueller';
import { thaliaScraper } from './thalia';
import { genericScraper } from './generic';

export const scrapers: Scraper[] = [
  amazonScraper,
  targetScraper,
  walmartScraper,
  bestBuyScraper,
  geizhalsScraper,
  muellerScraper,
  thaliaScraper,
  genericScraper,
];

export { genericScraper } from './generic';