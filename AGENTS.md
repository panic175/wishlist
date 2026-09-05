# AGENTS.md — Wishlist

Guidance for AI agents working in this repository.

## Overview

Self-hosted family wishlist app. Users create wishlists, share them publicly via
slug URL, add items with purchase links, and let visitors claim items.

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: SQLite via Drizzle ORM (`better-sqlite3`)
- **Auth**: JWT (access + refresh) stored in httpOnly cookies. Optional Authelia
  forward-auth (`AUTHELIA_ENABLED`) via `proxy.ts` (Next.js 16 proxy, Node runtime)
  which trusts `AUTHELIA_USER_HEADER` (default `X-Forwarded-User`) and provisions
  a session; `/api/auth/login` is disabled while enabled; the login page reads
  runtime env `AUTHELIA_PORTAL_URL` (no `NEXT_PUBLIC_*` build-time vars).
  Public wishlist/claim flows stay open.
- **Other**: Lexical rich text editor, Sharp image processing, Axios + Cheerio scraping

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run start      # production server
npm run lint       # eslint
npm run db:seed    # seed sample data (tsx lib/db/seed.ts)
npm test           # e2e tests (playwright), if installed
```

## Directory map

```
app/                          # Next.js App Router
  [slug]/page.tsx             # Public wishlist page (slug route)
  admin/page.tsx              # Admin dashboard (client)
  admin/login/page.tsx        # Admin login
  api/                        # REST route handlers
    items/[id]/route.ts       # Item GET/PATCH/DELETE
    wishlists/[id]/items/     # Item list/create
    scrape/route.ts           # URL scraping autofill
    settings/route.ts         # Site settings
    ...                       # auth/, public/, lock/, health/, uploads/
  layout.tsx                  # Root layout (AuthProvider/ThemeProvider/LanguageProvider)
components/
  admin/                      # Admin UI (ItemForm, ItemCard, WishlistCard, SettingsSection...)
  header.tsx, footer.tsx      # Shared chrome
  image-upload.tsx            # Reusable image upload (file/URL/paste)
  item-form.tsx               # (unused legacy draft; admin uses components/admin/ItemForm)
  theme-provider.tsx          # light/dark theme context
  password-lock-guard.tsx     # site password lock wrapper
  protected-route.tsx         # admin auth guard
  RichTextEditor.tsx          # Lexical WYSIWYG
  share-button.tsx            # Web Share API
lib/
  api.ts                      # fetch-based API client + types
  auth-context.tsx            # React auth context
  auth/utils.ts               # JWT generate/verify
  db/index.ts                 # SQLite + Drizzle setup + manual migrations
  db/schema.ts                # Drizzle schema (wishlists, wishlist_items, settings)
  db/seed.ts                  # sample data
  scraping/                   # product URL scrapers (registry pattern)
    index.ts                  # registry entry: scrapeUrl(), matches(url) -> scraper, generic fallback
    types.ts                  # Scraper interface + ScrapedData shape
    utils.ts                  # shared fetchHtml/extractPrice helpers
    scrapers/*.ts             # one module per site (amazon, target, walmart, bestbuy, generic, index)
  i18n/                       # UI translation system
    translations.ts           # en + de dictionaries
    provider.tsx              # LanguageProvider context with t()
public/, data/db/wishlist.db  # uploads & sqlite db (gitignored)
```

## Data model

- **wishlists**: id, name, slug (unique), description, preferences (rich HTML),
  image_url, is_public, sort_order, timestamps.
- **wishlist_items**: id, wishlist_id (FK cascade), name, description, price (primary),
  currency, quantity, images, `purchase_urls` (JSON array
  `{label, url, price?, currency?, imageUrl?}`), is_archived, claim fields
  (claimed_by_*, claimed_at, is_purchased), sort_order, timestamps.
  - **Per-URL pricing**: each `purchase_urls[]` entry carries its own `price`/`currency`
    so URLs can show different prices. Item-level `price`/`currency` is the primary
    value used in cards.
- **settings**: id, key (unique), value. Known keys: `siteTitle`, `homepageSubtext`,
  `passwordLockEnabled`, `passwordLockHash`, `language`, `defaultCurrency`.

Migrations are manual: `lib/db/index.ts` `initializeDatabase()` runs
`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` fallbacks inside a try/catch. New
columns/schema changes are added there, not via drizzle-kit by default.

## API endpoints

- **Auth**: `POST /api/auth/login|logout|refresh`, `GET /api/auth/me`
- **Wishlists**: `GET|POST /api/wishlists`, `GET|PATCH|DELETE /api/wishlists/[id]`,
  `POST /api/wishlists/[id]/reorder`
- **Items**: `GET /api/wishlists/[id]/items`, `POST /api/wishlists/[id]/items`,
  `GET|PATCH|DELETE /api/items/[id]`, `POST /api/items/[id]/reorder`,
  `POST /api/items/[id]/refresh` (rescrape one purchase URL)
- **Public**: `GET /api/public/wishlists`, `GET /api/[slug]`,
  `POST /api/public/items/[id]/claim|unclaim`
- **Misc**: `GET|PUT /api/settings`, `POST /api/scrape`, `GET /api/health`,
  `POST /api/lock`, `POST /uploads`, `GET /uploads/[...path]`

Admin routes require JWT (`access_token` cookie); item create/update requires admin.

## State management

No external state library. React Context (`AuthContext`, `ThemeContext`,
`LanguageContext`) + local `useState`/`useEffect` + `fetch` against the REST API.
Server components (layout) read settings directly from the DB.

## Internationalization (i18n)

- UI strings come from `lib/i18n/translations.ts` (en/de) and are rendered via the
  `t(key)` function from `LanguageProvider`.
- The active language is the `language` setting from `/api/settings` (default `en`).
- **Never translate user content** (wishlist names, item names, descriptions,
  preferences). Only UI chrome/labels/buttons/errors.

## Currency

- App-wide default currency: `defaultCurrency` setting (falls back to
  `DEFAULT_CURRENCY` env, then `USD`).
- Each item can override its own `currency`; per-URL entries also carry currency.

## Conventions

- `'use client'` on all interactive components.
- Data flows: REST API → fetch (in `lib/api.ts`) → `useState` → render.
- New scrapers: add a module to `lib/scraping/scrapers/` implementing the
  `Scraper` interface and register it in the registry array. Do not extend the
  legacy `service.ts` if/else chain.
- Keep commits focused; run `npm run lint` and `npm run build` before finishing.
