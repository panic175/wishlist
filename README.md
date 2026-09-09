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

## Single Sign-On / Forward Auth (Optional)

The admin area (`/admin`) can be protected by any identity provider that can
**forward-authenticate** at your reverse proxy — Authelia, Keycloak,
Authentik, Ory Kratos, Okta, etc. The proxy runs every `/admin/*` request
through the provider, then injects the authenticated username into a request
header which the app converts into its own session. The app is provider-
agnostic: it only ever reads that one header.

**Required environment variables:**

```env
FORWARD_AUTH_ENABLED=true
FORWARD_AUTH_USER_HEADER=Remote-User   # must match the header your proxy injects (see below)
FORWARD_AUTH_PORTAL_URL=https://auth.example.com   # shown on the admin login page
FORWARD_AUTH_PROVIDER_NAME=Keycloak    # optional - "Continue with Keycloak"; defaults to "SSO"
```

When enabled:
- The built-in admin login is disabled (`POST /api/auth/login` returns 403).
- `/admin/login` becomes a "Continue with {provider}" link to the portal.
- Any verified provider user can manage wishlists, so restriction rules should
  be defined in the provider (the app does not enforce roles).

These **runtime** env vars are read by `proxy.ts`, `/api/auth/login` and the
admin login page — no build-time `NEXT_PUBLIC_*` values are required, so a
single prebuilt image works for any SSO provider and for standalone
deployments.

**The one requirement on the proxy:** it must **strip** any client-supplied
`FORWARD_AUTH_USER_HEADER` and **overwrite** it with the verified username only
after successful authentication (never pass a client value through). See
`DEPLOYMENT.md` for ready-made configs. `FORWARD_AUTH_USER_HEADER` must match
exactly the header the proxy is configured to inject.

### Traefik (docker providers)

This app ships a second `wishlist-admin` Traefik router that runs `/admin`
through forward-auth while leaving the public site (`/` and `/[slug]`) fully
open. Where the forward-auth middleware lives depends on your provider:

**Authelia** — the middleware is defined in labels on your Authelia container
(hence `authelia@docker`), so no file-provider middleware is needed:

```yaml
labels:
  traefik.http.middlewares.authelia.forwardauth.address: http://authelia:9091/api/authz/forward-auth
  traefik.http.middlewares.authelia.forwardauth.trustForwardHeader: "true"
  traefik.http.middlewares.authelia.forwardauth.authResponseHeaders: Remote-User
```

**Keycloak / Authentik** (any provider with an OIDC `/authz` or forward-auth
endpoint) — define a file-provider middleware pointing at that endpoint:

```yaml
# dynamic config (e.g. /etc/traefik/dynamic/forwardauth.yml)
http:
  middlewares:
    keycloak:
      forwardAuth:
        address: http://keycloak:8080/realms/master/protocol/openid-connect/auth?client_id=...&redirect_uri=...&scope=openid
        # set the verified username into the header the app expects
        authResponseHeaders:
          - Remote-User
        trustForwardHeader: true
```

`trustForwardHeader: true` makes Traefik **always overwrite** a client-supplied
header with the value the provider verified, so a visitor cannot forge their
identity — this is what satisfies the header-trust requirement. The
`authResponseHeaders` value must match `FORWARD_AUTH_USER_HEADER`.

On the **wishlist** container, the two routers (see `docker-compose.yml`). The
domain comes from the `WISHLIST_DOMAIN` env var (defaults to `wishlist.example.com`);
replace the `authelia@docker` middleware name with whatever your forward-auth
middleware is called:

```yaml
labels:
  # public: fully open
  - "traefik.http.routers.wishlist.rule=Host(`${WISHLIST_DOMAIN:-wishlist.example.com}`)"
  # admin: behind forward-auth, higher priority
  - 'traefik.http.routers.wishlist-admin.rule=Host(`${WISHLIST_DOMAIN:-wishlist.example.com}`) && PathRegexp(`^/admin(?:/.*)?$`)'
  - "traefik.http.routers.wishlist-admin.middlewares=<your-forwardauth-middleware>,secHeaders@file,localIpWhitelist@file"
  - "traefik.http.routers.wishlist-admin.priority=10"
```

Configure your provider to restrict the admin area (Authelia example; Keycloak/
Authentik use a client + policy/role for the same effect):

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

**Important:** the app code (this repo) must be baked into the image you deploy;
`FORWARD_AUTH_ENABLED` etc. only take effect in a build that includes
`proxy.ts` and `lib/auth/forward-auth.ts`.

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
