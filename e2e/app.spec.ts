import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'e2e-pass';

async function login(page: Page) {
  // Authelia forward-auth mode: the app trusts the proxy-injected
  // X-Forwarded-User header to bootstrap a session (see proxy.ts).
  const response = await page.request.get('/api/auth/me', {
    headers: { 'X-Forwarded-User': ADMIN_USER },
  });
  expect(response.ok()).toBe(true);

  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: /your wishlists|their wishlists|ihre wunschlisten/i })
  ).toBeVisible();
}

async function createWishlist(page: Page, name: string, slug: string) {
  const response = await page.request.post('/api/wishlists', {
    data: { name, slug, description: '', isPublic: true },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { wishlist: { id: string } };
}

async function createItem(
  page: Page,
  wishlistId: string,
  data: {
    name: string;
    price?: number;
    currency?: string;
    purchaseUrls?: unknown;
  }
) {
  const response = await page.request.post(`/api/wishlists/${wishlistId}/items`, {
    data: { name: data.name, price: data.price ?? null, currency: data.currency ?? 'USD', purchaseUrls: data.purchaseUrls ?? null },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { item: { id: string } };
}

async function deleteWishlist(page: Page, wishlistId: string) {
  const response = await page.request.delete(`/api/wishlists/${wishlistId}`);
  expect(response.ok()).toBe(true);
}

async function expandWishlist(page: Page, name: string) {
  const card = page
    .getByRole('heading', { name })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")]')
    .first();
  await card.getByRole('button', { name: /show items/i }).click();
}

test('homepage renders seeded public wishlists', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Built for families');
  await expect(page.getByText("Dad's Wishlist").first()).toBeVisible();
});

test('authelia mode disables legacy login and gates /admin without a session', async ({ page }) => {
  // The built-in app login is disabled while Authelia is enabled.
  const legacyLogin = await page.request.post('/api/auth/login', {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  expect(legacyLogin.status()).toBe(403);

  // The login page shows the Authelia continuation link instead of the form.
  await page.goto('/admin/login');
  await expect(page.getByRole('link', { name: 'Continue with Authelia' })).toBeVisible();

  // Without the trusted header the admin area redirects to the login page…
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);

  // …and the session endpoint rejects the anonymous request.
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});

test('admin can create a wishlist through the UI', async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const name = `UI Test ${stamp}`;

  await page.getByRole('button', { name: /create wishlist|wunschliste erstellen/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.locator('input[type="text"]').nth(0).fill(name);
  await dialog.locator('textarea').fill('Created by UI test');
  const createButton = dialog.getByRole('button', { name: /^create$/i });
  await createButton.scrollIntoViewIfNeeded();
  await createButton.click();

  await expect(page.getByText(name)).toBeVisible();

  const wishlistsRes = await page.request.get('/api/wishlists');
  const { wishlists } = (await wishlistsRes.json()) as { wishlists: Array<{ id: string; slug: string }> };
  const created = wishlists.find((w) => w.slug === `ui-test-${stamp}`);
  expect(created).toBeTruthy();
  await deleteWishlist(page, created!.id);
});

test('switching UI language to German updates public labels', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Edit Settings' }).click();
  const languageSelect = page.getByRole('combobox').nth(0);
  await languageSelect.selectOption('de');
  await page.getByRole('button', { name: 'Save Settings' }).click();

  await page.goto('/');
  await expect(page.locator('body')).toContainText('Für Familien gebaut');

  // Restore English
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Einstellungen bearbeiten' }).click();
  await page.getByRole('combobox').nth(0).selectOption('en');
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
});

test('default currency setting is saved and available on the home page', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Edit Settings' }).click();
  const currencySelect = page.getByRole('combobox').nth(1);
  await currencySelect.selectOption('EUR');
  await page.getByRole('button', { name: 'Save Settings' }).click();

  const res = await page.request.get('/api/settings');
  const { settings } = (await res.json()) as { settings: { defaultCurrency?: string } };
  expect(settings.defaultCurrency).toBe('EUR');

  // Restore USD
  await page.getByRole('button', { name: 'Edit Settings' }).click();
  await page.getByRole('combobox').nth(1).selectOption('USD');
  await page.getByRole('button', { name: 'Save Settings' }).click();
});

test('adding an item by URL uses scraped data to autofill the form', async ({ page }) => {
  await login(page);

  const slug = `scrape-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Scrape Test List', slug);

  await page.route('**/api/scrape', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          title: 'Mocked 4K Camera',
          description: 'A very realistic camera',
          price: 129.99,
          currency: 'USD',
          imageUrl: '/images/items/mock-camera.jpg',
          url: 'https://shop.example.com/camera',
        },
      }),
    })
  );

  await page.goto('/admin');
  await expandWishlist(page, 'Scrape Test List');
  await page.getByRole('button', { name: /add item|artikel hinzufügen/i }).click();

  const form = page.locator('form');
  await form.getByPlaceholder(/https:\/\/example\.com\/product/i).fill('https://shop.example.com/camera');
  await form.getByRole('button', { name: /scrape|abrufen/i }).click();

  await expect(page.locator('input[value="Mocked 4K Camera"]')).toHaveCount(1);
  await expect(page.locator('input[value="129.99"]')).toHaveCount(1);
  await expect(page.locator('input[value="https://shop.example.com/camera"]')).toHaveCount(2);

  await form.getByRole('button', { name: /add item|artikel hinzufügen/i }).last().click();

  await expect(page.getByText('Mocked 4K Camera')).toBeVisible();
  await expect(page.getByText('129.99 USD').first()).toBeVisible();

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('each purchase URL shows its own price on the public page', async ({ page }) => {
  await login(page);

  const slug = `perurl-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Per-URL Test List', slug);

  await createItem(page, wishlist.wishlist.id, {
    name: 'Camera',
    price: 10,
    purchaseUrls: [
      { label: 'Store A', url: 'https://a.example.com/camera', price: 10, currency: 'USD' },
      { label: 'Store B', url: 'https://b.example.com/camera', price: 14.5, currency: 'USD' },
    ],
  });
  await createItem(page, wishlist.wishlist.id, {
    name: 'Tripod',
    price: 30,
    purchaseUrls: [
      { label: 'Store C', url: 'https://c.example.com/tripod', price: 30, currency: 'EUR' },
    ],
  });

  await page.goto(`/${slug}`);
  await expect(page.getByText('Per-URL Test List')).toBeVisible();

  await expect(page.locator('body')).toContainText('$10.00');
  await expect(page.locator('body')).toContainText('$14.50');
  await expect(page.locator('body')).toContainText('€30.00');

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('refresh endpoint enforces auth and validates the URL', async ({ page }) => {
  const unauth = await page.request.post('/api/items/not-a-real-id/refresh', {
    data: { url: 'https://example.com/x' },
  });
  expect(unauth.status()).toBe(401);

  await login(page);
  const slug = `refresh-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Refresh Test List', slug);
  const item = await createItem(page, wishlist.wishlist.id, {
    name: 'Gadget',
    price: 50,
    purchaseUrls: [{ label: 'Store', url: 'https://store.example.com/gadget', price: 50, currency: 'USD' }],
  });

  const missingUrl = await page.request.post(`/api/items/${item.item.id}/refresh`, { data: {} });
  expect(missingUrl.status()).toBe(400);

  const unknownUrl = await page.request.post(`/api/items/${item.item.id}/refresh`, {
    data: { url: 'https://store.example.com/other' },
  });
  expect(unknownUrl.status()).toBe(404);

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('edit mode shows a refresh button for existing purchase URLs', async ({ page }) => {
  await login(page);

  const slug = `edit-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Edit Test List', slug);
  await createItem(page, wishlist.wishlist.id, {
    name: 'EBook Reader',
    price: 90,
    purchaseUrls: [{ label: 'Reader Store', url: 'https://reader.example.com/ebook', price: 90, currency: 'USD' }],
  });

  await page.goto('/admin');
  await expandWishlist(page, 'Edit Test List');
  await page.getByTitle('Edit item').first().click();

  await expect(page.getByRole('button', { name: 'Update price & image' })).toBeVisible();

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('exporting a wishlist produces a downloadable CSV with item data', async ({ page }) => {
  await login(page);

  const slug = `export-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Export Test List', slug);
  await createItem(page, wishlist.wishlist.id, {
    name: 'Keyboard',
    price: 79,
    currency: 'EUR',
    purchaseUrls: [{ label: 'Keyboard Store', url: 'https://kb.example.com/keyboard', price: 79, currency: 'EUR' }],
  });

  const downloadPromise = page.waitForEvent('download');
  await page.goto('/admin');
  await expandWishlist(page, 'Export Test List');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  const path = await download.path();
  const content = (await import('node:fs')).readFileSync(path!, 'utf-8');

  expect(download.suggestedFilename()).toBe(`wishlist-${slug}.csv`);
  expect(content.replace(/^\uFEFF/, '')).toContain('name,description,price,currency,quantity');
  expect(content).toContain('Keyboard');
  expect(content).toContain('79');
  expect(content).toContain('EUR');
  expect(content).toContain('https://kb.example.com/keyboard');

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('importing a CSV adds new items to a wishlist', async ({ page }) => {
  await login(page);

  const slug = `import-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Import Test List', slug);
  const csv = [
    'name,description,price,currency,quantity,purchase_urls',
    'USB-C Cable,2m braided,19.99,EUR,2,"[{""label"":""Cable Store"",""url"":""https://cable.example.com"",""price"":19.99,""currency"":""EUR""}]"',
    'Phone Stand,Aluminium,25,GBP,1,"[{""label"":""Stand Store"",""url"":""https://stand.example.com"",""price"":25,""currency"":""GBP""}]"',
  ].join('\r\n');

  const importRes = await page.request.post(`/api/wishlists/${wishlist.wishlist.id}/import`, {
    data: { csv },
  });
  expect(importRes.ok()).toBe(true);
  const { created, skipped } = (await importRes.json()) as { created: number; skipped: number };
  expect(created).toBe(2);
  expect(skipped).toBe(0);

  const itemsRes = await page.request.get(`/api/wishlists/${wishlist.wishlist.id}/items`);
  const { items } = (await itemsRes.json()) as { items: Array<{ name: string; price: number; currency: string; quantity: number; purchaseUrls: unknown }> };
  expect(items).toHaveLength(2);

  const cable = items.find((i) => i.name === 'USB-C Cable');
  expect(cable?.price).toBe(19.99);
  expect(cable?.currency).toBe('EUR');
  expect(cable?.quantity).toBe(2);
  expect(cable?.purchaseUrls).toHaveLength(1);

  await page.goto(`/${slug}`);
  await expect(page.getByText('USB-C Cable')).toBeVisible();
  await expect(page.getByText('Phone Stand')).toBeVisible();

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('import CSV requires the name column and valid csv', async ({ page }) => {
  await login(page);
  const slug = `import-bad-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Import Bad Test List', slug);

  const missingName = await page.request.post(`/api/wishlists/${wishlist.wishlist.id}/import`, {
    data: { csv: 'description\njust a note\n' },
  });
  expect(missingName.status()).toBe(400);

  const noBody = await page.request.post(`/api/wishlists/${wishlist.wishlist.id}/import`, {
    data: {},
  });
  expect(noBody.status()).toBe(400);

  await deleteWishlist(page, wishlist.wishlist.id);
});