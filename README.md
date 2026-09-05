# Wishlist

[![Docker Hub](https://img.shields.io/docker/pulls/reggiodigital/wishlist)](https://hub.docker.com/r/reggiodigital/wishlist)
[![License](https://img.shields.io/github/license/Reggio-Digital/wishlist)](https://github.com/Reggio-Digital/wishlist/blob/main/LICENSE)

A simple, self-hosted wishlist app for sharing gift ideas with family and friends.

## Why This App?

Most wishlist apps are bloated with features you don't need, require accounts for everyone, or lock you into a platform. This app solves a simple problem: you want to share what you'd like as gifts, and your friends and family want to claim items without spoiling the surprise.

**Features:**

- **Simple** - No complex features, just wishlists and items
- **Easy to Share** - Send a single URL, no signups required
- **Multiple Purchase Links** - Add multiple store links for each item so people can choose where to buy
- **Public/Private Wishlists** - Keep lists private while you're working on them, then make them public when ready
- **No Peeking!** - Admins can't see claimed items from the dashboard - you'd have to visit the specific wishlist's public URL to spoil the surprise
- **Privacy-Focused** - Self-hosted, your data stays with you
- **Transparent** - Anyone viewing the list can see what's been claimed to avoid duplicates
- **Low Maintenance** - Single Docker container with SQLite, no database setup needed
- **URL Scraping** - Auto-fill item details from product URLs _(Coming Soon)_

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

## Quick Start

### Using Docker Compose

```bash
# Clone and configure
git clone https://github.com/Reggio-Digital/wishlist
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

## Data Storage

Data is stored in `/app/data`:

- `/app/data/db` - SQLite database files
- `/app/data/uploads` - Uploaded images

## Environment Variables

Create a `.env` file:

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
SECRET=

# Optional - Cookie Security
# Set to 'false' for HTTP access (e.g., local LAN without HTTPS)
# When unset, auto-detects HTTPS via X-Forwarded-Proto header
COOKIE_SECURE=false
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

## Authelia Single Sign-On (Optional)

The admin area (`/admin`) can be protected by [Authelia](https://www.authelia.com)
using forward-auth. The reverse proxy runs every `/admin/*` request through
Authelia, then injects the authenticated username into a request header which
the app converts into its own session.

**Required environment variables:**

```env
AUTHELIA_ENABLED=true
AUTHELIA_USER_HEADER=Remote-User   # must match the forwardauth authResponseHeaders below
AUTHELIA_PORTAL_URL=https://auth.example.com   # shown on the admin login page
```

When enabled:
- The built-in admin login is disabled (`POST /api/auth/login` returns 403).
- `/admin/login` becomes a "Continue with Authelia" link to the portal.
- Any verified Authelia user can manage wishlists, so restriction rules should
  be defined in Authelia (the app does not enforce roles).

These **runtime** env vars are read by `proxy.ts`, `/api/auth/login` and the
admin login page — no build-time `NEXT_PUBLIC_*` values are required, so a
single prebuilt image works for both Authelia and standalone deployments.

### Traefik + Authelia (docker providers)

This app ships a second `wishlist-admin` Traefik router that runs `/admin`
through Authelia while leaving the public site (`/` and `/[slug]`) fully open.
The forward-auth middleware is defined in labels on your Authelia container
(hence `authelia@docker`), so no file-provider middleware is needed.

On the **Authelia** container, expose a forward-auth middleware:

```yaml
labels:
  traefik.http.middlewares.authelia.forwardauth.address: http://authelia:9091/api/authz/forward-auth
  traefik.http.middlewares.authelia.forwardauth.trustForwardHeader: "true"
  traefik.http.middlewares.authelia.forwardauth.authResponseHeaders: Remote-User
```

`trustForwardHeader: true` makes Traefik **always overwrite** a client-supplied
header matching the configured `authResponseHeaders` with the value Authelia
verified, so a visitor cannot forge their identity — this is what satisfies the
header-trust requirement. `AUTHELIA_USER_HEADER` (default `Remote-User`) must
match whatever `authResponseHeaders` on your Authelia container is set to.

On the **wishlist** container, the two routers (see `docker-compose.yml`). The
domain comes from the `WISHLIST_DOMAIN` env var (defaults to `wishlist.example.com`):

```yaml
labels:
  # public: fully open
  - "traefik.http.routers.wishlist.rule=Host(`${WISHLIST_DOMAIN:-wishlist.example.com}`)"
  # admin: behind Authelia, higher priority
  - 'traefik.http.routers.wishlist-admin.rule=Host(`${WISHLIST_DOMAIN:-wishlist.example.com}`) && PathRegexp(`^/admin(?:/.*)?$`)'
  - "traefik.http.routers.wishlist-admin.middlewares=authelia@docker,secHeaders@file,localIpWhitelist@file"
  - "traefik.http.routers.wishlist-admin.priority=10"
```

In your Authelia `configuration.yml`, restrict the admin area (default policy is
normally `deny`, with a `bypass` rule for the public wishlist site):

```yaml
access_control:
  default_policy: deny
  rules:
    - domain: wishlist.example.com
      resources:
        - '^/admin(/.*)?$'
      policy: one_factor   # or two_factor
```

The `example.com` domains above are placeholders — replace them or set
`WISHLIST_DOMAIN` in `.env` next to your compose file.

**Important:** the app code (this repo) must be baked into the image you deploy
`AUTHELIA_ENABLED` etc. only take effect in a build that includes `proxy.ts` and
`lib/auth/authelia.ts`.

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
```

## Pages

- `/admin/login` - Admin authentication
- `/admin` - Admin dashboard (manage wishlists and items)
- `/[slug]` - Public wishlist view

## License

MIT

---

Made with ❤️ by [Reggio Digital](https://reggiodigital.com)
