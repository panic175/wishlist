// API client for Next.js API routes

const API_BASE_URL = '/api';

export interface ApiError {
  message: string;
  status: number;
}

/**
 * Single-flight refresh token rotation. Because access tokens are short-lived
 * (15 minutes), a single 401 triggers a refresh of the token pair; concurrent
 * requests share one refresh so we do not rotate the refresh token repeatedly.
 */
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/me')
  );
}

/**
 * fetch wrapper that transparently refreshes the session when an API call
 * returns 401 because the short-lived access token expired, then retries once.
 */
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let response = await fetch(url, options);

  if (response.status === 401 && !isAuthEndpoint(url)) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await fetch(url, options);
    }
  }

  return response;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'An error occurred' }));
    // Extract error message from various possible response formats
    const message = error.error || error.message || 'An error occurred';
    // A 401 from an auth endpoint (e.g. /auth/me probing the session) is
    // expected control flow for unauthenticated visitors, not an error.
    if (!(response.status === 401 && isAuthEndpoint(response.url))) {
      console.error('API Error:', { status: response.status, message });
    }
    throw { message, status: response.status } as ApiError;
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : ({} as T);
}

// Auth API
export const authApi = {
  // Tokens are set as httpOnly cookies by the server and never returned to
  // JavaScript, so the client only needs to know the call succeeded.
  async login(username: string, password: string) {
    const response = await apiFetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
    await handleResponse(response);
  },

  async logout() {
    const response = await apiFetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    await handleResponse<void>(response);
  },

  async refresh() {
    const response = await apiFetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    await handleResponse<void>(response);
  },

  async me() {
    const response = await apiFetch(`${API_BASE_URL}/auth/me`, {
      credentials: 'include',
    });
    const data = await handleResponse<{ success: boolean; user: { username: string } }>(response);
    return data.user;
  },
};

// Wishlist types
export interface Wishlist {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  preferences: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseUrl {
  label: string;
  url: string;
  price?: number | null;
  currency?: string;
  imageUrl?: string | null;
}

export interface Item {
  id: string;
  wishlistId: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  quantity: number;
  imageUrl: string | null;
  purchaseUrls: PurchaseUrl[] | null;
  isArchived: boolean;
  claimedByName: string | null;
  claimedByNote: string | null;
  claimedAt: string | null;
  isPurchased: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Wishlists API
export const wishlistsApi = {
  async getAll() {
    const response = await apiFetch(`${API_BASE_URL}/wishlists`, {
      credentials: 'include',
    });
    const data = await handleResponse<{ success: boolean; wishlists: Wishlist[] }>(response);
    return data.wishlists;
  },

  async getAllPublic() {
    const response = await apiFetch(`${API_BASE_URL}/public/wishlists`, {
      credentials: 'include',
    });
    const data = await handleResponse<{ success: boolean; wishlists: Wishlist[] }>(response);
    return data.wishlists;
  },

  async getOne(id: string) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}`, {
      credentials: 'include',
    });
    const result = await handleResponse<{ success: boolean; wishlist: Wishlist }>(response);
    return result.wishlist;
  },

  async getBySlug(slug: string) {
    const response = await apiFetch(`${API_BASE_URL}/${slug}`, {
      credentials: 'include',
    });
    const result = await handleResponse<{ success: boolean; wishlist: Wishlist }>(response);
    return result.wishlist;
  },

  async create(data: Partial<Wishlist>) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; wishlist: Wishlist }>(response);
    return result.wishlist;
  },

  async update(id: string, data: Partial<Wishlist>) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ success: boolean; wishlist: Wishlist }>(response);
    return result.wishlist;
  },

  async delete(id: string) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(response);
  },

  async reorder(id: string, newSortOrder: number) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ newSortOrder }),
    });
    const result = await handleResponse<{ success: boolean; wishlist: Wishlist }>(response);
    return result.wishlist;
  },

  async exportCsv(id: string): Promise<string> {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}/export`, {
      credentials: 'include',
    });
    if (!response.ok) await handleResponse(response);
    return response.text();
  },

  async importCsv(id: string, csv: string) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${id}/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ csv }),
    });
    return handleResponse<{ success: boolean; created: number; skipped: number }>(response);
  },
};

// Items API
export const itemsApi = {
  async getAll(wishlistId: string) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${wishlistId}/items`, {
      credentials: 'include',
    });
    const result = await handleResponse<{ success: boolean; items: Item[] }>(response);
    return result.items;
  },

  async getOne(id: string) {
    const response = await apiFetch(`${API_BASE_URL}/items/${id}`, {
      credentials: 'include',
    });
    return handleResponse<Item>(response);
  },

  async create(wishlistId: string, data: Partial<Item>) {
    const response = await apiFetch(`${API_BASE_URL}/wishlists/${wishlistId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse<Item>(response);
  },

  async update(id: string, data: Partial<Item>) {
    const response = await apiFetch(`${API_BASE_URL}/items/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return handleResponse<Item>(response);
  },

  async delete(id: string) {
    const response = await apiFetch(`${API_BASE_URL}/items/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleResponse<void>(response);
  },

  async reorder(id: string, newSortOrder: number) {
    const response = await apiFetch(`${API_BASE_URL}/items/${id}/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ newSortOrder }),
    });
    const result = await handleResponse<{ success: boolean; item: Item }>(response);
    return result.item;
  },

  async refreshUrl(id: string, url: string) {
    const response = await apiFetch(`${API_BASE_URL}/items/${id}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ url }),
    });
    const result = await handleResponse<{
      success: boolean;
      data: ScrapedData;
      item: Item;
    }>(response);
    return result.item;
  },
};

// Claiming API (public)
export const claimingApi = {
  async claim(itemId: string, name?: string, note?: string) {
    const response = await apiFetch(`${API_BASE_URL}/public/items/${itemId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, note }),
    });
    return handleResponse<{ claimToken: string; message: string }>(response);
  },

  async unclaim(itemId: string, claimToken: string) {
    const response = await apiFetch(`${API_BASE_URL}/public/items/${itemId}/unclaim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ claimToken }),
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },
};

// Scraping API
export interface ScrapedData {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  url?: string;
}

export const scrapingApi = {
  async scrapeUrl(url: string) {
    const response = await apiFetch(`${API_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ url }),
    });
    const result = await handleResponse<{ success: boolean; data: ScrapedData }>(response);
    return result.data;
  },
};

// Settings API
export interface Settings {
  siteTitle: string;
  homepageSubtext: string;
  passwordLockEnabled?: boolean;
  passwordLock?: string;
  language?: string;
  defaultCurrency?: string;
}

export const settingsApi = {
  async getSettings() {
    const response = await apiFetch(`${API_BASE_URL}/settings`, {
      credentials: 'include',
    });
    const result = await handleResponse<{ success: boolean; settings: Settings }>(response);
    return result.settings;
  },

  async updateSettings(settings: Partial<Settings>) {
    const response = await apiFetch(`${API_BASE_URL}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(settings),
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },
};

// Version info API (admin)
export interface AppVersion {
  version: string | null;
  commit: string | null;
  buildTime: string | null;
}

export const versionApi = {
  async get(): Promise<AppVersion> {
    const response = await apiFetch(`${API_BASE_URL}/version`, {
      credentials: 'include',
    });
    const result = await handleResponse<{ success: boolean; version: string | null; commit: string | null; buildTime: string | null }>(response);
    return {
      version: result.version ?? null,
      commit: result.commit ?? null,
      buildTime: result.buildTime ?? null,
    };
  },
};
