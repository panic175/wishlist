'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { wishlistsApi, itemsApi, claimingApi, type Wishlist, type Item } from '@/lib/api';
import Header from '@/components/header';
import Footer from '@/components/footer';
import PasswordLockGuard from '@/components/password-lock-guard';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n/provider';

const CLAIM_NAME_STORAGE_KEY = 'wishlist-claim-name';
const CLAIM_TOKENS_STORAGE_KEY = 'wishlist-claim-tokens';

export default function PublicWishlistPage() {
  const { t, lang } = useLanguage();
  const { username, isAuthenticated } = useAuth();
  const params = useParams();
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [showClaimed, setShowClaimed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Claim form state
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);
  const [claimName, setClaimName] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [justClaimedItemId, setJustClaimedItemId] = useState<string | null>(null);
  const [justClaimedNote, setJustClaimedNote] = useState('');

  // Unclaim state
  const [isUnclaiming, setIsUnclaiming] = useState(false);
  const [unclaimError, setUnclaimError] = useState('');
  const requestIdRef = useRef(0);
  // Claim tokens returned at claim time; held client-side (never exposed via
  // public item responses) and required to unclaim an item. They are persisted
  // to localStorage so a reload does not orphan the visitor's own claims.
  // (The page renders a loading skeleton until items are fetched, so reading
  // storage here cannot cause a hydration mismatch.)
  const [claimTokens, setClaimTokens] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  });

  const slug = typeof params.slug === 'string' ? params.slug : undefined;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const persistClaimTokens = (tokens: Record<string, string>) => {
    try {
      window.localStorage.setItem(
        CLAIM_TOKENS_STORAGE_KEY,
        JSON.stringify(tokens)
      );
    } catch {
      // localStorage unavailable — tokens stay in memory only.
    }
  };

  const fetchWishlist = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!slug) return;

    try {
      const wishlistData = await wishlistsApi.getBySlug(slug);
      const itemsData = await itemsApi.getAll(wishlistData.id);
      if (requestId !== requestIdRef.current) return;
      setWishlist(wishlistData);
      setItems(itemsData.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(getErrorMessage(error, 'Wishlist not found'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const loadWishlist = window.setTimeout(() => {
      void fetchWishlist();
    }, 0);

    return () => window.clearTimeout(loadWishlist);
  }, [fetchWishlist]);

  const handleClaimItem = (itemId: string) => {
    setClaimingItemId(itemId);
    setClaimError('');
    const storedName = window.localStorage.getItem(CLAIM_NAME_STORAGE_KEY);
    setClaimName(storedName !== null ? storedName : username || '');
    setClaimNote('');
    setJustClaimedItemId(null);
  };

  const handleSubmitClaim = async (e: React.FormEvent, itemId: string) => {
    e.preventDefault();

    setIsClaiming(true);
    setClaimError('');

    try {
      const claimResult = await claimingApi.claim(itemId, claimName.trim() || undefined, claimNote);
      setClaimTokens((prev) => {
        const next = { ...prev, [itemId]: claimResult.claimToken };
        persistClaimTokens(next);
        return next;
      });

      setJustClaimedItemId(itemId);
      setJustClaimedNote(claimNote);
      setClaimingItemId(null);
      setClaimName(claimName.trim());
      setClaimNote('');
      fetchWishlist();
    } catch (error: unknown) {
      setClaimError(getErrorMessage(error, 'Failed to claim item'));
    } finally {
      setIsClaiming(false);
    }
  };

  const handleUnclaim = async (itemId: string) => {
    if (!confirm(t('wishlist.unclaimConfirm'))) {
      return;
    }

    const claimToken = claimTokens[itemId];
    if (!isAuthenticated && !claimToken) {
      setUnclaimError(t('wishlist.unclaimTokenMissing'));
      return;
    }

    setIsUnclaiming(true);
    setUnclaimError('');

    try {
      await claimingApi.unclaim(itemId, claimToken || '');
      setClaimTokens((prev) => {
        const next = { ...prev };
        delete next[itemId];
        persistClaimTokens(next);
        return next;
      });
      fetchWishlist();
    } catch (error: unknown) {
      setUnclaimError(getErrorMessage(error, t('wishlist.unclaimFailed')));
    } finally {
      setIsUnclaiming(false);
    }
  };

  const filteredItems = showClaimed
    ? items
    : items.filter((item) => !item.claimedAt || item.id === justClaimedItemId);

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null) return null;
    return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price);
  };

  const getPurchaseCurrency = (item: Item, currency?: string) => {
    if (currency === 'USD' && item.currency && item.currency !== 'USD') {
      return item.currency;
    }
    return currency || item.currency;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
      </div>
    );
  }

  if (error || !wishlist) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('wishlist.notFoundTitle')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{error || t('wishlist.notFoundBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <PasswordLockGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header
          title={wishlist.name}
          subtitle={wishlist.description || undefined}
          imageUrl={wishlist.imageUrl || undefined}
          maxWidth="max-w-5xl"
        />

      {/* Main Content */}
      <div className="max-w-5xl mx-auto py-12 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          <Link
            href="/"
            className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 mb-6 transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {t('wishlist.backToHome')}
          </Link>

          {/* Preferences Section */}
          {wishlist.preferences && (
            <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                {t('wishlist.preferences')}
              </h2>
              <div
                className="prose prose-indigo dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 [&_a]:text-indigo-600 [&_a]:dark:text-indigo-400 [&_a]:hover:underline"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(wishlist.preferences) }}
                onClick={(e) => {
                  // Make all links open in new tab
                  const target = e.target as HTMLElement;
                  if (target.tagName === 'A') {
                    e.preventDefault();
                    window.open((target as HTMLAnchorElement).href, '_blank', 'noopener,noreferrer');
                  }
                }}
              />
            </div>
          )}

          {/* Controls */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showClaimed}
                  onChange={(e) => setShowClaimed(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('wishlist.showClaimed')}</span>
              </label>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {filteredItems.length} of {items.length} {lang === 'de' ? 'Artikel' : 'items'}
            </div>
          </div>

          {unclaimError && (
            <div role="alert" className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded-lg">
              {unclaimError}
            </div>
          )}

          {/* Items List */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
              <p className="text-gray-500 dark:text-gray-400">
                {showClaimed ? t('wishlist.noItems') : t('wishlist.allClaimed')}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all duration-300 hover:scale-105 overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Left: Image */}
                    {item.imageUrl && (
                      <div className="md:w-48 md:flex-shrink-0">
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          width={192}
                          height={192}
                          unoptimized
                          className="w-full h-48 md:h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Middle: Item Details */}
                    <div className="flex-1 p-6">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-base text-gray-600 dark:text-gray-300 mb-4">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Right: Action Area */}
                    <div className="md:w-80 md:flex-shrink-0 p-6 bg-gray-50 dark:bg-gray-900/50 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 flex flex-col">
                      <div className="mb-4">
                        {item.purchaseUrls && item.purchaseUrls.length > 0 && (
                          <div className="space-y-2">
                            {item.purchaseUrls.map((url, idx) => (
                              <a
                                key={idx}
                                href={url.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between text-base px-4 py-3 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer border border-gray-200 dark:border-gray-700"
                              >
                                <span className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium">
                                  {url.label}
                                </span>
                                <span className="text-gray-900 dark:text-white font-bold text-lg">
                                  {url.price !== null && url.price !== undefined ? formatPrice(url.price, getPurchaseCurrency(item, url.currency)) : item.price !== null ? formatPrice(item.price, item.currency) : ''}
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Claimed Badge, Success Message, or Claim Button/Form */}
                      <div className="mt-auto">
                      {justClaimedItemId === item.id ? (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="flex items-center justify-center mb-2">
                            <div className="w-12 h-12 bg-green-500 dark:bg-green-600 rounded-full flex items-center justify-center">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                          <p className="text-center text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {t('wishlist.itemClaimed')}
                          </p>
                          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {t('wishlist.statusLocked')}
                          </p>
                          {justClaimedNote && (
                            <p className="text-center text-xs text-gray-600 dark:text-gray-400 italic">
                              {t('wishlist.yourNote', { note: `"${justClaimedNote}"` })}
                            </p>
                          )}
                        </div>
                      ) : item.claimedAt ? (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                          <p className="text-sm font-medium text-green-800 dark:text-green-200">
                            {t('wishlist.claimedBy', { name: item.claimedByName || '' })}
                          </p>
                          {item.claimedByNote && (
                            <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                              {t('wishlist.note', { note: item.claimedByNote })}
                            </p>
                          )}
                          {item.isPurchased && (
                            <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-medium">
                              {t('wishlist.purchased')}
                            </p>
                          )}
                          {showClaimed && (claimTokens[item.id] || isAuthenticated) && (
                            <button
                              onClick={() => handleUnclaim(item.id)}
                              disabled={isUnclaiming}
                              className="mt-3 w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 font-medium disabled:opacity-50 transition-colors cursor-pointer text-sm"
                            >
                              {isUnclaiming ? t('wishlist.unclaiming') : t('wishlist.unclaimItem')}
                            </button>
                          )}
                        </div>
                      ) : claimingItemId === item.id ? (
                        <div className="space-y-3">
                          <form onSubmit={(e) => handleSubmitClaim(e, item.id)} className="space-y-3">
                            {claimError && (
                              <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 rounded text-xs">
                                {claimError}
                              </div>
                            )}

                            <div>
                              <label htmlFor={`claim-name-${item.id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('wishlist.nameLabel')}
                              </label>
                              <input
                                id={`claim-name-${item.id}`}
                                type="text"
                                value={claimName}
                                onChange={(e) => {
                                  const name = e.target.value;
                                  setClaimName(name);
                                  window.localStorage.setItem(CLAIM_NAME_STORAGE_KEY, name);
                                }}
                                autoComplete="name"
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                              />
                            </div>

                            <div>
                              <label htmlFor={`claim-note-${item.id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {t('wishlist.addNoteOptional')}
                              </label>
                              <textarea
                                id={`claim-note-${item.id}`}
                                rows={3}
                                placeholder={t('wishlist.claimPlaceholder')}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white resize-none"
                                value={claimNote}
                                onChange={(e) => setClaimNote(e.target.value)}
                              />
                            </div>

                            <button
                              type="submit"
                              disabled={isClaiming}
                              className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 font-medium disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {isClaiming ? t('wishlist.claiming') : t('wishlist.confirmClaim')}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleClaimItem(item.id)}
                          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium transition-colors cursor-pointer"
                        >
                          {t('wishlist.claimThisItem')}
                        </button>
                      )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        <Footer />
      </div>
    </PasswordLockGuard>
  );
}
