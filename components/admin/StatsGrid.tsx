'use client';

import { useLanguage } from '@/lib/i18n/provider';

interface Stats {
  totalWishlists: number;
  publicWishlists: number;
  totalItems: number;
}

interface StatsGridProps {
  stats: Stats;
}

export default function StatsGrid({ stats }: StatsGridProps) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
      <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 text-3xl">📋</div>
            <div className="ml-4 w-0 flex-1">
              <dl>
                <dt className="text-base font-medium text-gray-500 dark:text-gray-400 truncate">
                  {t('stats.totalWishlists')}
                </dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalWishlists}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 text-3xl">🌐</div>
            <div className="ml-4 w-0 flex-1">
              <dl>
                <dt className="text-base font-medium text-gray-500 dark:text-gray-400 truncate">
                  {t('stats.publicWishlists')}
                </dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.publicWishlists}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 text-3xl">🎁</div>
            <div className="ml-4 w-0 flex-1">
              <dl>
                <dt className="text-base font-medium text-gray-500 dark:text-gray-400 truncate">
                  {t('stats.totalItems')}
                </dt>
                <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalItems}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}