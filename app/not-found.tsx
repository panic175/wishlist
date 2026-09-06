'use client';

import './globals.css';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/provider';

export default function RootNotFound() {
  const { t, lang } = useLanguage();

  return (
    <html lang={lang}>
      <body>
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="text-6xl font-bold text-gray-800 dark:text-gray-200">404</div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-4">
              {t('notFound.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-4">
              {t('notFound.body')}
            </p>
            <Link
              href="/"
              className="inline-block mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold no-underline"
            >
              {t('notFound.goHome')}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}