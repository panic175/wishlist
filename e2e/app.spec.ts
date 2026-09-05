import { test, expect, type Page } from '@playwright/test';
import * as cheerio from 'cheerio';
import { amazonScraper } from '@/lib/scraping/scrapers/amazon';
import { thaliaScraper } from '@/lib/scraping/scrapers/thalia';

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'e2e-pass';

// 1x1 transparent PNG for upload tests (the upload route only checks MIME type).
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

test('German Amazon markup parses the EUR price and high-resolution image', () => {
  const $ = cheerio.load(`
    <html lang="de-de">
      <span class="a-price">
        <span class="a-offscreen">42,95 €</span>
        <span class="a-price-whole">42</span>
        <span class="a-price-fraction">95</span>
      </span>
      <img
        id="landingImage"
        src="https://m.media-amazon.com/images/I/71P5Zo8R8LL._AC_SX300_SY300_QL70_ML2_.jpg"
        data-old-hires="https://m.media-amazon.com/images/I/71P5Zo8R8LL._AC_SL1500_.jpg"
      />
    `);

  const result = amazonScraper.scrape($, 'https://www.amazon.de/example');

  expect(result.price).toBe(42.95);
  expect(result.currency).toBe('EUR');
  expect(result.imageUrl).toBe(
    'https://m.media-amazon.com/images/I/71P5Zo8R8LL._AC_SL1500_.jpg'
  );
});

test('Thalia product markup parses JSON-LD product data', () => {
  const $ = cheerio.load(`
    <html>
      <script type="application/ld+json">
        ${JSON.stringify({
          '@type': 'Product',
          name: 'Thalia Beispielartikel',
          image: ['/images/product.jpg'],
          offers: { price: '19.99', priceCurrency: 'EUR' },
        })}
      </script>
      <meta property="og:image" content="/images/fallback.jpg" />
    </html>
  `);

  const result = thaliaScraper.scrape($, 'https://www.thalia.de/shop/home/artikeldetails/A1075014562');

  expect(result.title).toBe('Thalia Beispielartikel');
  expect(result.price).toBe(19.99);
  expect(result.currency).toBe('EUR');
  expect(result.imageUrl).toBe('https://www.thalia.de/images/product.jpg');
});

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
  await expect(form.locator('img[alt="Preview"]')).toHaveAttribute(
    'src',
    '/images/items/mock-camera.jpg'
  );

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

test('visitor can claim and unclaim an item on the public page', async ({ page }) => {
  await login(page);

  const slug = `claim-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Claim Test List', slug);
  const item = await createItem(page, wishlist.wishlist.id, {
    name: 'Claimable Headphones',
    price: 45,
  });

  await page.goto(`/${slug}`);
  await expect(page.getByText('Claimable Headphones')).toBeVisible();

  await page.getByRole('button', { name: 'Claim This Item' }).click();
  await expect(page.getByLabel('Your name:')).toHaveValue(ADMIN_USER);
  await page.getByLabel('Your name:').fill('Grandma');
  await page.locator(`#claim-note-${item.item.id}`).fill('Buying this next week');
  await page.getByRole('button', { name: 'Confirm Claim' }).click();

  await expect(page.getByText('Item Claimed!')).toBeVisible();

  // The claim is persisted in the API.
  const itemsRes = await page.request.get(`/api/wishlists/${wishlist.wishlist.id}/items`);
  const { items } = (await itemsRes.json()) as {
    items: Array<{ claimedAt: string | null; claimedByName: string | null; claimedByNote: string | null }>;
  };
  expect(items[0].claimedAt).toBeTruthy();
  expect(items[0].claimedByName).toBe('Grandma');
  expect(items[0].claimedByNote).toBe('Buying this next week');

  // Reload to clear the client-side success state; the item now renders as
  // claimed with an unclaim action under "Show claimed items".
  await page.reload();

  page.once('dialog', (d) => d.accept());
  await page.getByLabel('Show claimed items').check();
  await page.getByRole('button', { name: 'Unclaim Item' }).click();

  await expect(page.getByRole('button', { name: 'Claim This Item' })).toBeVisible();

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('admin APIs reject anonymous requests while public endpoints stay open', async ({ page }) => {
  // Public endpoints that must remain open.
  const publicLists = await page.request.get('/api/public/wishlists');
  expect(publicLists.ok()).toBe(true);
  const { wishlists } = (await publicLists.json()) as {
    wishlists: Array<{ id: string; slug: string }>;
  };
  const dad = wishlists.find((w) => w.slug === 'dads-wishlist');
  expect(dad).toBeTruthy();

  const settings = await page.request.get('/api/settings');
  expect(settings.ok()).toBe(true);

  const itemsRes = await page.request.get(`/api/wishlists/${dad!.id}/items`);
  expect(itemsRes.ok()).toBe(true);
  const { items } = (await itemsRes.json()) as { items: Array<{ id: string }> };
  expect(items.length).toBeGreaterThan(0);

  expect((await page.request.get(`/api/items/${items[0].id}`)).ok()).toBe(true);
  expect((await page.request.get(`/api/${dad!.slug}`)).ok()).toBe(true);

  // Every admin/mutation endpoint must reject the anonymous session.
  const adminCalls: Array<[string, 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', unknown]> = [
    ['/api/wishlists', 'GET', undefined],
    ['/api/wishlists', 'POST', { name: 'x', slug: 'x' }],
    [`/api/wishlists/${dad!.id}`, 'GET', undefined],
    [`/api/wishlists/${dad!.id}`, 'PATCH', { name: 'x' }],
    [`/api/wishlists/${dad!.id}`, 'DELETE', undefined],
    [`/api/wishlists/${dad!.id}/items`, 'POST', { name: 'x' }],
    [`/api/items/${items[0].id}`, 'PATCH', { name: 'x' }],
    [`/api/items/${items[0].id}`, 'DELETE', undefined],
    [`/api/items/${items[0].id}/reorder`, 'POST', { newSortOrder: 0 }],
    [`/api/wishlists/${dad!.id}/reorder`, 'POST', { newSortOrder: 0 }],
    ['/api/settings', 'PUT', { siteTitle: 'x' }],
    ['/api/scrape', 'POST', { url: 'https://example.com' }],
  ];
  for (const [url, method, body] of adminCalls) {
    const options: { method: string; data?: unknown } = { method };
    if (body !== undefined) options.data = body;
    const response = await page.request.fetch(url, options);
    expect(response.status(), `${method} ${url}`).toBe(401);
  }

  // In Authelia mode the built-in login endpoint is disabled entirely.
  const legacyLogin = await page.request.post('/api/auth/login', {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  expect(legacyLogin.status()).toBe(403);
});

test('password lock gates the public pages and unlocks after the site password', async ({ page }) => {
  await login(page);

  const origRes = await page.request.get('/api/settings');
  const { settings: original } = (await origRes.json()) as {
    settings: { passwordLockEnabled: boolean };
  };

  try {
    const enable = await page.request.put('/api/settings', {
      data: { passwordLockEnabled: true, passwordLock: 'e2e-lock-pass' },
    });
    expect(enable.ok()).toBe(true);

    await page.goto('/');
    await expect(page).toHaveURL(/\/lock$/);
    await expect(page.getByRole('heading', { name: 'Password Required' })).toBeVisible();

    // Wrong password shows an error.
    await page.locator('#password').fill('nope');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Incorrect password')).toBeVisible();

    // Correct password unlocks and returns to the home page.
    await page.locator('#password').fill('e2e-lock-pass');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('body')).toContainText('Built for families');
  } finally {
    await page.request.put('/api/settings', {
      data: { passwordLockEnabled: original.passwordLockEnabled ?? false },
    });
  }
});

test('admin can create, edit, and delete an item through the UI', async ({ page }) => {
  await login(page);
  const slug = `ui-items-${Date.now()}`;
  const wishlist = await createWishlist(page, 'UI Items Test', slug);

  const itemName = `UI Item ${Date.now()}`;
  const updatedName = `${itemName} renamed`;

  await page.goto('/admin');
  await expandWishlist(page, 'UI Items Test');

  await page.getByRole('button', { name: /add item/i }).click();
  let form = page.locator('form').first();

  await form.locator('input[type="text"]').first().fill(itemName);
  await form.locator('input[type="number"]').first().fill('19.99');
  await form.locator('textarea').fill('A UI-created item');
  await form.getByRole('button', { name: /^add item$/i }).click();

  await expect(page.locator('h5', { hasText: itemName })).toBeVisible();

  // Edit the item name.
  await page.getByTitle('Edit item').click();
  form = page.locator('form').first();
  await form.locator('input[type="text"]').first().fill(updatedName);
  await form.getByRole('button', { name: /^save$/i }).click();

  await expect(page.locator('h5', { hasText: updatedName })).toBeVisible();

  // Delete the item via the confirm dialog.
  page.once('dialog', (d) => d.accept());
  await page.getByTitle('Delete item').click();

  await expect(page.locator('h5')).toHaveCount(0);

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('reordering items and wishlists persists across refetches', async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const wlA = await createWishlist(page, `Reorder A ${stamp}`, `reorder-a-${stamp}`);
  const wlB = await createWishlist(page, `Reorder B ${stamp}`, `reorder-b-${stamp}`);

  const i1 = await createItem(page, wlA.wishlist.id, { name: 'First', price: 1 });
  const i2 = await createItem(page, wlA.wishlist.id, { name: 'Second', price: 2 });
  const i3 = await createItem(page, wlA.wishlist.id, { name: 'Third', price: 3 });

  await page.goto('/admin');

  // Wishlists: move B above A (the click fires an async reorder + refetch, so
// poll the API until the new order is persisted).
  const cardB = page.locator('div.rounded-lg', {
    has: page.getByRole('heading', { name: `Reorder B ${stamp}` }),
  });
  await cardB.getByTitle('Move up').click();

  await expect.poll(async () => {
    const res = await page.request.get('/api/wishlists');
    const { wishlists } = (await res.json()) as { wishlists: Array<{ id: string }> };
    const order = wishlists.map((w) => w.id);
    return order.indexOf(wlB.wishlist.id) < order.indexOf(wlA.wishlist.id);
  }).toBe(true);

  // Items: move 'Third' up twice so it lands first. Wait on the DOM between
  // moves so the second click sees the post-refetch state, then verify the API.
  await expandWishlist(page, `Reorder A ${stamp}`);
  const cardA = page.locator('div.rounded-lg', {
    has: page.getByRole('heading', { name: `Reorder A ${stamp}` }),
  });
  const thirdItem = cardA.locator('div.rounded', {
    has: page.locator('h5', { hasText: 'Third' }),
  });
  const itemCards = cardA.locator('div.rounded');

  await thirdItem.getByTitle('Move up').click();
  await expect(itemCards.nth(1).locator('h5')).toContainText('Third');

  await thirdItem.getByTitle('Move up').click();
  await expect(itemCards.nth(0).locator('h5')).toContainText('Third');

  await expect.poll(async () => {
    const res = await page.request.get(`/api/wishlists/${wlA.wishlist.id}/items`);
    const { items } = (await res.json()) as { items: Array<{ id: string }> };
    return items.map((i) => i.id).join(',') === [i3.item.id, i1.item.id, i2.item.id].join(',');
  }).toBe(true);

  await deleteWishlist(page, wlB.wishlist.id);
  await deleteWishlist(page, wlA.wishlist.id);
});

test('refreshing a purchase URL updates the item price from scraped data', async ({ page }) => {
  await login(page);
  const slug = `refresh-ok-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Refresh OK Test List', slug);
  const item = await createItem(page, wishlist.wishlist.id, {
    name: 'Smart Light',
    price: 40,
    currency: 'USD',
    purchaseUrls: [{ label: 'Light Store', url: 'https://lights.example.com/smart', price: 40, currency: 'USD' }],
  });

  await page.route('**/api/items/*/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { price: 55, currency: 'EUR', imageUrl: '/uploads/items/refreshed.webp' },
        item: {
          id: item.item.id,
          name: 'Smart Light',
          price: 55,
          currency: 'EUR',
          imageUrl: '/uploads/items/refreshed.webp',
          purchaseUrls: [{ label: 'Light Store', url: 'https://lights.example.com/smart', price: 55, currency: 'EUR' }],
        },
      }),
    })
  );

  await page.goto('/admin');
  await expandWishlist(page, 'Refresh OK Test List');
  await page.getByTitle('Edit item').click();

  await page.getByRole('button', { name: 'Update price & image' }).first().click();

  const form = page.locator('form').first();
  await expect(form.locator('input[type="number"]').first()).toHaveValue('55');

  await form.getByRole('button', { name: /^save$/i }).click();

  // The save handler is async and not awaited by the click, so poll the API
  // until the refreshed price is persisted, then assert the rest of the record.
  await expect.poll(async () => {
    const itemsRes = await page.request.get(`/api/wishlists/${wishlist.wishlist.id}/items`);
    const { items } = (await itemsRes.json()) as { items: Array<{ price: number | null }> };
    return items[0]?.price;
  }).toBe(55);

  const itemsRes = await page.request.get(`/api/wishlists/${wishlist.wishlist.id}/items`);
  const { items } = (await itemsRes.json()) as {
    items: Array<{
      price: number;
      currency: string;
      purchaseUrls: Array<{ price: number; currency: string }>;
    }>;
  };
  expect(items[0].currency).toBe('EUR');
  expect(items[0].purchaseUrls[0].price).toBe(55);

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('site title and homepage subtext from settings render on the public home page', async ({ page }) => {
  await login(page);

  const origRes = await page.request.get('/api/settings');
  const { settings: original } = (await origRes.json()) as {
    settings: { siteTitle?: string; homepageSubtext?: string };
  };

  const newTitle = `E2E Title ${Date.now()}`;
  const newSubtext = `E2E subtext ${Date.now()}`;
  try {
    const update = await page.request.put('/api/settings', {
      data: { siteTitle: newTitle, homepageSubtext: newSubtext },
    });
    expect(update.ok()).toBe(true);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: newTitle })).toBeVisible();
    await expect(page.getByText(newSubtext)).toBeVisible();
  } finally {
    await page.request.put('/api/settings', {
      data: {
        siteTitle: original.siteTitle ?? 'Wishlist',
        homepageSubtext: original.homepageSubtext ?? '',
      },
    });
  }
});

test('uploading an image file saves and serves the wishlist image', async ({ page }) => {
  await login(page);
  const slug = `upload-${Date.now()}`;
  const wishlist = await createWishlist(page, 'Upload Test List', slug);

  await page.goto('/admin');
  const card = page
    .getByRole('heading', { name: 'Upload Test List' })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")]')
    .first();
  await card.getByTitle('Edit wishlist').click();

  await page.setInputFiles('input[type="file"][accept*="image"]', {
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });

  // A preview renders once the upload completes.
  await expect(page.locator('img[alt="Preview"]')).toBeVisible();

  await page.getByTitle('Save').click();

  let uploadedUrl: string | null = null;
  await expect(async () => {
    const res = await page.request.get(`/api/wishlists/${wishlist.wishlist.id}`);
    const { wishlist: fetched } = (await res.json()) as { wishlist: { imageUrl: string | null } };
    expect(fetched.imageUrl).toMatch(/^\/uploads\/wishlists\//);
    uploadedUrl = fetched.imageUrl;
  }).toPass();

  expect(uploadedUrl).toMatch(/^\/uploads\/wishlists\/.+\.webp$/);

  await deleteWishlist(page, wishlist.wishlist.id);
});

test('unknown wishlist slugs render the not-found view', async ({ page }) => {
  await page.goto('/this-slug-should-not-exist-abc123');
  await expect(page.getByRole('heading', { name: 'Wishlist Not Found' })).toBeVisible();
});