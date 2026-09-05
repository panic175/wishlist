'use client';

import { useEffect, useState } from 'react';
import ImageUpload from '@/components/image-upload';
import PurchaseUrlFields from './PurchaseUrlFields';
import { scrapingApi, type Item } from '@/lib/api';
import { useLanguage } from '@/lib/i18n/provider';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY'] as const;

interface ItemFormProps {
  item?: Partial<Item>;
  onSubmit: (item: Partial<Item>) => Promise<void>;
  onCancel: () => void;
  mode: 'create' | 'edit';
  error?: string;
}

export default function ItemForm({ item, onSubmit, onCancel, mode, error }: ItemFormProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Partial<Item>>(
    item || {
      name: '',
      description: '',
      price: null,
      currency: 'USD',
      quantity: 1,
      imageUrl: '',
      purchaseUrls: [],
    }
  );
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');

  const hostnameLabel = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return;
    setIsScraping(true);
    setScrapeError('');
    try {
      const normalizedUrl = scrapeUrl.startsWith('http') ? scrapeUrl : `https://${scrapeUrl}`;
      const data = await scrapingApi.scrapeUrl(scrapeUrl);

      setFormData((prev) => ({
        ...prev,
        name: data.title || prev.name,
        description: data.description || prev.description,
        price: data.price ?? prev.price,
        currency: data.currency || prev.currency,
        imageUrl: data.imageUrl || prev.imageUrl,
        purchaseUrls: prev.purchaseUrls?.some((u) => u.url === normalizedUrl)
          ? prev.purchaseUrls
          : [
              ...(prev.purchaseUrls || []),
              {
                label: hostnameLabel(normalizedUrl),
                url: normalizedUrl,
                price: data.price ?? null,
                currency: data.currency || prev.currency || 'USD',
                imageUrl: data.imageUrl || null,
              },
            ],
      }));
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : t('itemForm.scrapeFailed'));
    } finally {
      setIsScraping(false);
    }
  };

  useEffect(() => {
    if (mode !== 'create') return;
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (active && data?.settings?.defaultCurrency) {
          setFormData((prev) => ({
            ...prev,
            currency: data.settings.defaultCurrency,
          }));
        }
      } catch {
        // keep default
      }
    })();
    return () => {
      active = false;
    };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h5 className="text-base font-medium text-gray-900 dark:text-white mb-3">
        {mode === 'create' ? t('itemForm.addNewItem') : t('itemForm.editItem')}
      </h5>
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded-lg text-base">
          {error}
        </div>
      )}
      {mode === 'create' && (
        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
          <h6 className="text-base font-medium text-indigo-900 dark:text-indigo-300 mb-1">
            {t('itemForm.autoFillTitle')}
          </h6>
          <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-2">
            {t('itemForm.autoFillHint')}
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              placeholder={t('itemForm.scrapePlaceholder')}
              className="flex-1 px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
            <button
              type="button"
              onClick={handleScrape}
              disabled={isScraping || !scrapeUrl}
              className="px-4 py-2 text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isScraping ? t('itemForm.scraping') : t('itemForm.scrape')}
            </button>
          </div>
          {scrapeError && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">{scrapeError}</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('itemForm.name')}
          </label>
          <input
            type="text"
            required
            className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('itemForm.price')}
          </label>
          <input
            type="number"
            step="0.01"
            className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            value={formData.price || ''}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                price: e.target.value ? parseFloat(e.target.value) : null,
              }))
            }
          />
        </div>
        <div>
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('itemForm.currency')}
          </label>
          <select
            className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            value={formData.currency || 'USD'}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, currency: e.target.value }))
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {t(`currency.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('itemForm.description')}
          </label>
          <textarea
            rows={2}
            className="w-full px-2 py-1.5 text-base border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            value={formData.description || ''}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </div>
        <div className="md:col-span-2">
          <ImageUpload
            currentImageUrl={formData.imageUrl || ''}
            onImageChange={(url) =>
              setFormData((prev) => ({ ...prev, imageUrl: url }))
            }
            onUploadStateChange={setIsImageUploading}
            type="item"
            label={t('itemForm.itemImage')}
          />
        </div>
        <div className="md:col-span-2">
          <PurchaseUrlFields
            purchaseUrls={formData.purchaseUrls || []}
            onChange={(urls) =>
              setFormData((prev) => ({ ...prev, purchaseUrls: urls }))
            }
            itemId={mode === 'edit' ? item?.id : undefined}
            onRefreshed={(updatedItem) =>
              setFormData((prev) => ({
                ...prev,
                price: updatedItem.price ?? prev.price,
                currency: updatedItem.currency || prev.currency,
                imageUrl: updatedItem.imageUrl || prev.imageUrl,
                purchaseUrls: updatedItem.purchaseUrls || prev.purchaseUrls || [],
              }))
            }
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isImageUploading || isSubmitting}
          className="px-4 py-2 text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImageUploading ? t('uploading') : isSubmitting ? t('saving') : mode === 'create' ? t('itemForm.addItemBtn') : t('save')}
        </button>
      </div>
    </form>
  );
}