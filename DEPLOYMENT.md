# Deployment notes

Security-relevant configuration for self-hosting behind a reverse proxy.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SECRET`, `REFRESH_SECRET` | JWT signing keys. **Set explicitly in production.** Auto-generated keys are persisted to `data/secrets.json`; on ephemeral/container storage they rotate on every restart and log everyone out. |
| `ADMIN_USERNAME` | Admin login username (default `admin`). |
| `ADMIN_PASSWORD` | Plaintext fallback credential. Use `ADMIN_PASSWORD_HASH` instead (scrypt; `npx tsx -e "import {hashPassword} from './lib/auth/password'; console.log(hashPassword('...'))"`). The default `changeme` is refused. |
| `AUTHELIA_ENABLED` | `true` → `/api/auth/login` is disabled and the app trusts the forward-auth identity header. |
| `AUTHELIA_USER_HEADER` | Header the reverse proxy injects with the authenticated username (default `X-Forwarded-User`). |
| `TRUST_PROXY_HEADERS` | `true` only when running behind a proxy that overwrites `X-Forwarded-For`/`X-Real-IP` for **every** request. Off by default: proxy IP headers are spoofable and would otherwise defeat per-IP rate limits. |
| `COOKIE_SECURE` | `true` forces Secure cookies. Leave unset to auto-detect from `X-Forwarded-Proto`/https in production. Set explicitly when TLS terminates at the proxy. |
| `DEFAULT_CURRENCY` | App-wide default currency (fallback when no setting exists). |
| `WISHLIST_DB_PATH` | SQLite path override (default `data/db/wishlist.db`). |

## TLS

Cookies are marked Secure and the Authelia identity header is only honoured on
TLS-terminated connections. Terminate TLS at the reverse proxy and set
`X-Forwarded-Proto: https` (real HTTPS, fixed by the proxy — never read from a
client header), or set `COOKIE_SECURE=true`.

## Rate limiting and client IP

The app honours `X-Forwarded-For`/`X-Real-IP` **only** when
`TRUST_PROXY_HEADERS=true`. When enabled, the proxy must overwrite (not append)
those headers so a client cannot inject a fake first entry:

```nginx
# nginx - overwrite, never pass through a client-supplied value
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # rewrite from remote addr
proxy_set_header X-Real-IP $remote_addr;
```

## Authelia forward-auth

When `AUTHELIA_ENABLED=true` the app mints a session from the configured
identity header on `/admin/*` and `/api/auth/me`. **The reverse proxy must
strip any client-supplied copy of that header and inject it only after
successful Authelia authentication**, otherwise a visitor can self-provision
an admin session with `X-Forwarded-User: admin`.

### nginx + Authelia

```nginx
# Strip any client-supplied value, then inject only the authenticated user.
auth_request /authelia;
auth_request_set $authelia_user $upstream_http_remote_user;
proxy_set_header X-Forwarded-User "";                # clears client value
proxy_set_header X-Forwarded-User $authelia_user;    # set from Authelia only

location /authelia {
    internal;
    proxy_pass http://authelia:9091/api/verify?auth=basic;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
}
```

Ensure the `X-Forwarded-User ""` reset applies to the **whole server / all
locations**, not just `/admin` — `/api/auth/me` is also in the proxy matcher.

### Traefik + Authelia

```yaml
# Traefik middleware: overwrites the header from the Authelia verify response.
http:
  middlewares:
    authelia:
      forwardAuth:
        address: http://authelia:9091/api/authz/forward-auth
        authResponseHeaders:
          - Remote-User
    stripUserHeader:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""      # clears client-supplied value
  routers:
    wishlist-admin:
      rule: "Host(`host`) && PathPrefix(`/admin`)"
      middlewares: [stripUserHeader, authelia]
      service: wishlist
```

Then set `AUTHELIA_USER_HEADER=X-Forwarded-User` (or the header you inject).

When Authelia is not in use, leave `AUTHELIA_ENABLED` unset so the header is
never read.