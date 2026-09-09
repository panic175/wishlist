'use client';

import { useState } from 'react';
import { type Settings } from '@/lib/api';
import { useLanguage } from '@/lib/i18n/provider';
import { supportedLanguages, type Language } from '@/lib/i18n/translations';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY'] as const;

interface SettingsSectionProps {
  settings: Settings;
  onUpdate: (settings: Settings) => Promise<void>;
}

export default function SettingsSection({ settings, onUpdate }: SettingsSectionProps) {
  const { t } = useLanguage();
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Settings>(settings);
  const [settingsError, setSettingsError] = useState('');

  const startEditingSettings = () => {
    setEditingSettings(true);
    setSettingsForm({ ...settings });
    setSettingsError('');
  };

  const cancelEditingSettings = () => {
    setEditingSettings(false);
    setSettingsError('');
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');

    try {
      await onUpdate(settingsForm);
      setEditingSettings(false);
    } catch (error: any) {
      setSettingsError(error.message || t('settings.updateFailed'));
    }
  };

  return (
    <div className="mb-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('settings.title')}
            </h2>
            {!editingSettings && (
              <button
                onClick={startEditingSettings}
                className="px-4 py-2 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
              >
                {t('settings.edit')}
              </button>
            )}
          </div>
        </div>
        <div className="p-5">
          {settingsError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded-lg text-base">
              {settingsError}
            </div>
          )}
          {editingSettings ? (
            <form onSubmit={handleUpdateSettings} className="space-y-4">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.siteTitle')}
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={settingsForm.siteTitle}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, siteTitle: e.target.value }))
                  }
                  placeholder={t('settings.siteTitlePlaceholder')}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.siteTitleHint')}
                </p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.homepageSubtext')}
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={settingsForm.homepageSubtext}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, homepageSubtext: e.target.value }))
                  }
                  placeholder={t('settings.homepageSubtextPlaceholder')}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.homepageSubtextHint')}
                </p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.language')}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={settingsForm.language || 'en'}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, language: e.target.value }))
                  }
                >
                  {supportedLanguages.map((lang: Language) => (
                    <option key={lang} value={lang}>
                      {lang === 'en' ? 'English' : 'Deutsch'}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.languageHint')}
                </p>
              </div>
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.defaultCurrency')}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  value={settingsForm.defaultCurrency || 'USD'}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, defaultCurrency: e.target.value }))
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`currency.${c}`)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.defaultCurrencyHint')}
                </p>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    id="passwordLockEnabled"
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    checked={settingsForm.passwordLockEnabled}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({ ...prev, passwordLockEnabled: e.target.checked }))
                    }
                  />
                  <label htmlFor="passwordLockEnabled" className="ml-2 block text-base font-medium text-gray-700 dark:text-gray-300">
                    {t('settings.passwordLock')}
                  </label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {t('settings.passwordLockHint')}
                </p>
                {settingsForm.passwordLockEnabled && (
                  <div>
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('settings.sitePassword')}
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                      value={settingsForm.passwordLock || ''}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({ ...prev, passwordLock: e.target.value }))
                      }
                      placeholder={t('settings.sitePasswordPlaceholder')}
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {t('settings.sitePasswordHint')}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEditingSettings}
                  className="px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
                >
                  {t('settings.save')}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.siteTitle')}</p>
                <p className="text-base text-gray-900 dark:text-white">{settings.siteTitle}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.homepageSubtext')}</p>
                <p className="text-base text-gray-900 dark:text-white">{settings.homepageSubtext}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.language')}</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {settings.language === 'de' ? 'Deutsch' : 'English'}
                </p>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('settings.passwordLockLabel')}</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {settings.passwordLockEnabled ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-base font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                      {t('settings.enabled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-base font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                      {t('settings.disabled')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}