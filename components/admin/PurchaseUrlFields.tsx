'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/provider';
import { itemsApi, type PurchaseUrl, type Item } from '@/lib/api';

interface PurchaseUrlFieldsProps {
  purchaseUrls: PurchaseUrl[];
  onChange: (urls: PurchaseUrl[]) => void;
  itemId?: string;
  onRefreshed?: (item: Item) => void;
}

export default function PurchaseUrlFields({
  purchaseUrls,
  onChange,
  itemId,
  onRefreshed,
}: PurchaseUrlFieldsProps) {
  const { t } = useLanguage();
  const [refreshingIndex, setRefreshingIndex] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState('');

  const handleAdd = () => {
    onChange([...purchaseUrls, { label: '', url: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(purchaseUrls.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: 'label' | 'url', value: string) => {
    const updated = [...purchaseUrls];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleRefresh = async (index: number, url: string) => {
    if (!itemId) return;
    setRefreshingIndex(index);
    setRefreshError('');
    try {
      const updatedItem = await itemsApi.refreshUrl(itemId, url);
      onChange(updatedItem.purchaseUrls || []);
      onRefreshed?.(updatedItem);
    } catch (err) {
      setRefreshError(t('urls.refreshFailed'));
    } finally {
      setRefreshingIndex(null);
    }
  };

  return (
    <div>
      <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
        {t('urls.title')}
      </label>
      <div className="space-y-2">
        {purchaseUrls.map((urlObj, index) => (
          <div key={index} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
            <input
              type="text"
              placeholder={t('urls.labelPlaceholder')}
              value={urlObj.label}
              onChange={(e) => handleUpdate(index, 'label', e.target.value)}
              className="w-full sm:w-1/3 px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            <input
              type="url"
              placeholder="https://example.com"
              value={urlObj.url}
              onChange={(e) => handleUpdate(index, 'url', e.target.value)}
              className="flex-1 px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            {itemId && urlObj.url && (
              <button
                type="button"
                onClick={() => handleRefresh(index, urlObj.url)}
                disabled={refreshingIndex !== null}
                className="px-2 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('urls.refresh')}
              >
                <svg
                  className={`w-5 h-5 ${refreshingIndex === index ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="px-2 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded cursor-pointer"
              title={t('urls.removeUrl')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        {refreshError && (
          <p className="text-sm text-red-700 dark:text-red-400">{refreshError}</p>
        )}
        <button
          type="button"
          onClick={handleAdd}
          className="w-full px-3 py-2 text-base border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
        >
          {t('urls.addUrl')}
        </button>
      </div>
    </div>
  );
}