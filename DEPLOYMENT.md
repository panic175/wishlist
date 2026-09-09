# Deployment notes

Security-relevant configuration for self-hosting behind a reverse proxy.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SECRET`, `REFRESH_SECRET` | JWT signing keys. **Set explicitly in production.** Auto-generated keys are persisted to `data/secrets.json`; on ephemeral/container storage they rotate on every restart and log everyone out. |
| `ADMIN_USERNAME` | Admin login username (default `admin`). |
| `ADMIN_PASSWORD` | Plaintext fallback credential. Use `ADMIN_PASSWORD_HASH` instead (scrypt; `npx tsx -e "import {hashPassword} from './lib/auth/password'; console.log(hashPassword('...'))"`). The default `changeme` is refused. |
| `FORWARD_AUTH_ENABLED` | `true` → `/api/auth/login` is disabled and the app trusts the forward-auth identity header. Works with any identity provider (Authelia, Keycloak, Authentik, ...). `AUTHELIA_ENABLED` is a deprecated alias. |
| `FORWARD_AUTH_USER_HEADER` | Header the reverse proxy injects with the authenticated username (default `X-Forwarded-User`). `AUTHELIA_USER_HEADER` is a deprecated alias. |
| `FORWARD_AUTH_PORTAL_URL` | Identity-provider portal URL shown on the admin login page. `AUTHELIA_PORTAL_URL` is a deprecated alias. |
| `FORWARD_AUTH_PROVIDER_NAME` | Display name for the "Continue with {provider}" button (default `SSO`). |
| `TRUST_PROXY_HEADERS` | `true` only when running behind a proxy that overwrites `X-Forwarded-For`/`X-Real-IP` for **every** request. Off by default: proxy IP headers are spoofable and would otherwise defeat per-IP rate limits. |
| `COOKIE_SECURE` | `true` forces Secure cookies. Leave unset to auto-detect from `X-Forwarded-Proto`/https in production. Set explicitly when TLS terminates at the proxy. |
| `DEFAULT_CURRENCY` | App-wide default currency (fallback when no setting exists). |
| `WISHLIST_DB_PATH` | SQLite path override (default `data/db/wishlist.db`). |

## TLS

Cookies are marked Secure and the forward-auth identity header is only honoured
on TLS-terminated connections. Terminate TLS at the reverse proxy and set
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

## Forward-auth (Authelia, Keycloak, Authentik, ...)

When `FORWARD_AUTH_ENABLED=true` the app mints a session from the configured
identity header on `/admin/*` and `/api/auth/me`. **The reverse proxy must
strip any client-supplied copy of that header and inject it only after
successful authentication with your provider**, otherwise a visitor can
self-provision an admin session with `X-Forwarded-User: admin`. The app is
provider-agnostic; only the proxy's forward-auth endpoint is provider-specific.
`FORWARD_AUTH_USER_HEADER` must equal the header the proxy injects.

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

### nginx + Keycloak (OIDC)

Point the internal `auth_request` at Keycloak's OIDC endpoint and copy the
verified username (`REMOTE_USER`) into the header:

```nginx
auth_request /keycloak_auth;
auth_request_set $auth_user $upstream_http_remote_user;
proxy_set_header X-Forwarded-User "";                # clears client value
proxy_set_header X-Forwarded-User $auth_user;

location /keycloak_auth {
    internal;
    proxy_pass http://keycloak:8080/realms/master/protocol/openid-connect/auth?client_id=wishlist&scope=openid;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
}
```

(Authentik exposes the same forward-auth shape at
`https://authentik:9000/outpost/goauthentik/auth/oidc/`.)

Ensure the `X-Forwarded-User ""` reset applies to the **whole server / all
locations**, not just `/admin` — `/api/auth/me` is also in the proxy matcher.

### Traefik

The middleware just overwrites the header from the provider's verify response;
swap `address` for whichever provider you use:

```yaml
http:
  middlewares:
    forwardAuth:            # Authelia: address: http://authelia:9091/api/authz/forward-auth
      forwardAuth:
        # Keycloak:  address: http://keycloak:8080/realms/master/protocol/openid-connect/auth?client_id=wishlist&redirect_uri=...&scope=openid
        # Authentik: address: http://authentik:9000/outpost/goauthentik/auth/oidc/
        address: http://authelia:9091/api/authz/forward-auth
        authResponseHeaders:
          - Remote-User
        trustForwardHeader: true
    stripUserHeader:
      headers:
        customRequestHeaders:
          X-Forwarded-User: ""      # clears client-supplied value
  routers:
    wishlist-admin:
      rule: "Host(`host`) && PathPrefix(`/admin`)"
      middlewares: [stripUserHeader, forwardAuth]
      service: wishlist
```

Then set `FORWARD_AUTH_USER_HEADER=X-Forwarded-User` (or the header you inject).

When no provider is in use, leave `FORWARD_AUTH_ENABLED` unset so the header is
never read.