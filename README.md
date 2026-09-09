# Wishlist

[![Docker Hub](https://img.shields.io/docker/pulls/reggiodigital/wishlist)](https://hub.docker.com/r/reggiodigital/wishlist)
[![License](https://img.shields.io/github/license/Reggio-Digital/wishlist)](https://github.com/Reggio-Digital/wishlist/blob/main/LICENSE)

A simple, self-hosted wishlist app for sharing gift ideas with family and friends.

> **This is a fork** of [Reggio-Digital/wishlist](https://github.com/Reggio-Digital/wishlist), extended with scraping, multi-currency, i18n, CSV, hardening and more (see [What this fork adds](#what-this-fork-adds)).

## Credits

**Original author & maintainer:** [Michael T — Reggio Digital](https://reggiodigital.com) ([Reggio-Digital/wishlist](https://github.com/Reggio-Digital/wishlist)).
The entire foundation — app concept, UI, Docker packaging, the LinuxServer.io-style `PUID`/`PGID` permission handling, and the original demo assets — is Reggio Digital's work. This fork only builds on top of it, and the [MIT license](LICENSE) (© Reggio Digital) is unchanged.

**Fork maintenance & extensions:** [Patrick Niemann](https://github.com/panic175) ([panic175/wishlist](https://github.com/panic175/wishlist)).

## Why This App?

Most wishlist apps are bloated with features you don't need, require accounts for everyone, or lock you into a platform. This app solves a simple problem: you want to share what you'd like as gifts, and your friends and family want to claim items without spoiling the surprise.

**Core features:**

- **Simple** - No complex features, just wishlists and items
- **Easy to Share** - Send a single URL, no signups required
- **Multiple Purchase Links** - Add multiple store links for each item so people can choose where to buy
- **Public/Private Wishlists** - Keep lists private while you're working on them, then make them public when ready
- **No Peeking!** - Admins can't see claimed items from the dashboard - you'd have to visit the specific wishlist's public URL to spoil the surprise
- **Privacy-Focused** - Self-hosted, your data stays with you
- **Transparent** - Anyone viewing the list can see what's been claimed to avoid duplicates
- **Low Maintenance** - Single Docker container with SQLite, no database setup needed

## Demo

![Demo Video](video.mp4)

## Screenshots

### Homepage

![Homepage](screenshot1.png)

### Wishlist View

![Wishlist View](screenshot2.png)

### Admin Dashboard

![Admin Dashboard](screenshot3.png)

### Admin Dashboard - Item Details

![Admin Dashboard - Item Details](screenshot4.png)

## What this fork adds

### URL scraping & auto-fill

Paste a product URL when adding an item and the app fetches title, description, price and image for you. Scrapers live in a pluggable registry (`lib/scraping/`) with site-specific modules plus a generic OpenGraph fallback that works for most other shops:

- Amazon (all country domains)
- Target, Walmart, Best Buy
- Geizhals, Müller, Thalia (German retail)
- Generic fallback (OpenGraph / meta tags) for everything else

Scraping runs server-side with SSRF protection (private/internal addresses are blocked) and URL-scheme validation.

### Per-URL pricing & price refresh

Each purchase link on an item carries its own `price`, `currency` and image — so the same item can show $79 on one store and €69 on another, and the public page renders those per-store prices. The admin dashboard has a **refresh** button (and `POST /api/items/[id]/refresh`) to re-scrape a single purchase URL when prices change.

### Multi-currency

- App-wide default currency in the admin settings, falling back to the `DEFAULT_CURRENCY` env var, then `USD`.
- Per-item currency selector, so mixed-currency lists (e.g. USD + EUR items) work.

### Internationalization (i18n)

All UI chrome (labels, buttons, settings, errors) is translatable; currently **English** and **German**. The active language is a setting changed from the admin dashboard — user content (wishlist/item names, descriptions) is never translated.

### CSV export & import

- **Export** a wishlist as CSV (`GET /api/wishlists/[id]/export`, "Export CSV" on the wishlist card) — Excel-safe with a UTF-8 BOM and CSV-formula-injection guarding.
- **Import** items from a CSV file (`POST /api/wishlists/[id]/import`), so lists can be migrated between instances or edited offline.

### Claim management

- Claimants can leave a name and a note; the name is remembered on their device for next time.
- Claims carry a token so they're tracked and verifiable server-side, and the public claim/unclaim flow is gated against tampering.
- An admin **claim manager** on the dashboard shows who claimed what, and claims can be released.

### Site password lock

Independent of the admin login, you can put a password in front of the *entire public site* (homepage and wishlist pages) via the admin settings. Unlocking sets a session cookie (`site_unlocked`); the unlock endpoint is brute-force rate-limited (10 attempts/min/IP).

### Authelia forward-auth (optional SSO)

When `AUTHELIA_ENABLED=true`, the app provisions an admin session from a trusted identity header injected by your reverse proxy (e.g. Authelia behind Traefik), and the built-in admin login is disabled. Only the `/admin` area is protected — wishlist viewing and claiming stay public. The header name is configurable (`AUTHELIA_USER_HEADER`). **Your proxy must strip any client-supplied copy of that header** (see `DEPLOYMENT.md` for an nginx example), otherwise visitors could self-provision admin sessions.

### Security hardening

- **JWT**: pinned algorithm, short access-token lifetime with refresh rotation, tokens kept in httpOnly cookies (not client JS)
- **CSRF** guards on mutating endpoints
- **Rate limiting** (per-IP, in-memory) on auth, lock and other hot endpoints; proxy IP headers only trusted when `TRUST_PROXY_HEADERS=true`
- **SSRF protection** and URL-scheme validation in the scraper
- **XSS**: HTML content sanitized (DOMPurify), nonce-based Content-Security-Policy (no `unsafe-inline` in production), clickjacking/leak-prevention headers, `Cross-Origin-Opener-Policy: same-origin`
- **Uploads** gated behind admin auth; password-lock hash never exposed via public settings; slugs and bodies validated
- `robots.txt` blocks search engines so your private wishlists stay out of Google
- Hardened admin credential validation (strong `ADMIN_PASSWORD` required, or `ADMIN_PASSWORD_HASH`/scrypt)

### Accessibility & performance

Semantic landmarks and heading order, improved link contrast, accessible theme toggle, and `fetchpriority` for the LCP image on the homepage.

### Developer & testing

- **Playwright e2e suite** (`e2e/`, `npm test`) covering auth, i18n, currency, scraping, per-URL pricing, claiming, lock, CRUD, reorder, settings, uploads and 404s
- **Node 24** base image
- App version badge on the admin dashboard

## Quick Start

### Using Docker Compose

```bash
# Clone and configure
git clone https://github.com/panic175/wishlist
cd wishlist
cp .env.example .env

# Edit .env with your admin credentials
nano .env

# Start with Docker Compose
docker-compose up -d
```

Visit http://localhost:3000

### Using Docker Image

```bash
docker run -d \
  -p 3000:3000 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your-secure-password \
  -v wishlist-data:/app/data \
  --name wishlist \
  reggiodigital/wishlist:latest
```

**For Unraid users:** Set `-e PUID=99 -e PGID=100`

> Note: the official `reggiodigital/wishlist` image contains the original release. To run the fork features above, build from this repo (`docker-compose up -d` with the included `docker-compose.yml` builds locally) or use a fork-built image.

## Data Storage

Data is stored in `/app/data`:

- `/app/data/db` - SQLite database files
- `/app/data/uploads` - Uploaded images

## Environment Variables

Create a `.env` file (full list in `.env.example`):

```env
# Required - Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Optional - User/Group IDs for docker-compose (defaults to 1000:1000)
# For Unraid, use PUID=99 and PGID=100
PUID=1000
PGID=1000

# Optional - JWT Secret (auto-generated if not provided)
# Generate with: openssl rand -base64 32
# In production, set SECRET (and REFRESH_SECRET) explicitly; auto-generated
# secrets rotate on restart of ephemeral containers and log everyone out.
SECRET=

# Optional - Cookie Security
# Set to 'false' for HTTP access (e.g., local LAN without HTTPS)
# When unset, auto-detects HTTPS via X-Forwarded-Proto header
# COOKIE_SECURE=false

# Optional - Default currency for new items (overridable per item)
DEFAULT_CURRENCY=USD

# Optional - Authelia forward-auth (protects /admin via your reverse proxy)
# See DEPLOYMENT.md - the proxy MUST strip client-supplied copies of the header
# AUTHELIA_ENABLED=true
# AUTHELIA_USER_HEADER=Remote-User
# AUTHELIA_PORTAL_URL=https://auth.example.com

# Optional - Only when behind a proxy that rewrites X-Forwarded-For for every request
# TRUST_PROXY_HEADERS=true

# Optional - Public hostname for the Traefik routers in docker-compose.yml
# WISHLIST_DOMAIN=wishlist.example.com
```

### User Permissions (PUID/PGID)

The container automatically handles file permissions using PUID/PGID environment variables (LinuxServer.io pattern):

- **Default:** `1000:1000` (standard Linux user)
- **Unraid:** Set `PUID=99` and `PGID=100` (nobody:users)
- **Find your IDs:** Run `id` on your system

Example for Unraid in `.env`:
```env
PUID=99
PGID=100
```

The entrypoint script automatically:
- Creates the user/group if needed
- Sets correct ownership on data directories
- Ensures proper file permissions for uploads

## Deployment (reverse proxy, Authelia)

The included `docker-compose.yml` ships Traefik router labels for a split setup: the public router serves everything except `/admin`, and the `/admin` router goes through Authelia forward-auth plus security-header and IP-whitelist middlewares. For TLS termination, header-stripping rules and nginx + Authelia examples, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint

# E2E tests (Playwright)
npm test

# Seed sample data
npm run db:seed
```

## Pages

- `/` - Homepage (public wishlists, optional site password lock)
- `/admin/login` - Admin authentication
- `/admin` - Admin dashboard (manage wishlists, items, claims, settings)
- `/[slug]` - Public wishlist view
- `/lock` - Site password unlock page
- `/api/health` - Health check

## License

MIT

---

A fork of the original [Reggio-Digital/wishlist](https://github.com/Reggio-Digital/wishlist), made with ❤️ by [Reggio Digital](https://reggiodigital.com) (original) and [Patrick Niemann](https://github.com/panic175) (fork).
