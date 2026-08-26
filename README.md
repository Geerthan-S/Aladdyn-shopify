# Aladdyn Shopify Connector

A standalone Next.js application that lets an authenticated Aladdyn user install a read-only Shopify app and inspect store data without exposing Shopify credentials to the browser.

The merchant journey is:

```text
Create or log in to Aladdyn
→ click Connect with Shopify
→ Shopify handles login and store selection from the App Store listing
→ Shopify sends the selected store to Aladdyn in a signed launch request
→ continue to Shopify's hosted authorization page
→ approve the app installation
→ return through a signed, replay-safe callback
→ inspect allowlisted Shopify datasets in Aladdyn
```

Aladdyn never asks for a Shopify admin password. Shopify performs the merchant login and permission approval.

## Architecture

```text
Browser (Supabase session cookies, UI only)
  ↓
Next.js 16 server routes
  ├─ authenticate the Aladdyn user
  ├─ normalize and allowlist the myshopify.com host
  ├─ validate OAuth state, timestamp, and callback HMAC
  ├─ rotate expiring offline Shopify token pairs
  ├─ encrypt tokens with AES-256-GCM
  ├─ execute allowlisted Admin GraphQL queries
  └─ verify raw webhook bodies and deduplicate webhook IDs
  ↓
Supabase Postgres
  ├─ user-readable connection metadata (RLS)
  ├─ service-role-only encrypted token material
  ├─ service-role-only, single-use OAuth state hashes
  ├─ service-role-only webhook receipts
  └─ service-role-only rate-limit buckets
```

Shopify GraphQL calls occur only in `src/lib/shopify/admin-graphql.ts`. There is no arbitrary GraphQL endpoint.

## Technology

- Next.js 16.3 App Router, React 19, TypeScript, and Tailwind CSS 4
- Supabase Auth, Supabase Postgres, and row-level security
- Shopify Admin GraphQL API `2026-07`
- Expiring offline access tokens with encrypted refresh-token rotation
- Zod runtime validation
- Vitest and Playwright
- Vercel-compatible deployment

Shopify `2026-07` is a stable version released July 1, 2026 and is supported until July 16, 2027. Review Shopify's [API versioning guide](https://shopify.dev/docs/api/usage/versioning) before the next quarterly upgrade.

## Local setup

Requirements: Node.js 22 or newer, npm, a Supabase project, a Shopify app in the Dev Dashboard, and a Shopify development/test store.

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local`. Never commit it.

Generate a 32-byte AES key locally:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the result directly into `SHOPIFY_TOKEN_ENCRYPTION_KEY`. Treat it like a production secret.

Start the application:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase/migrations/001_shopify_connector.sql`, or link the Supabase CLI and run `supabase db push`.
3. In Authentication → URL Configuration, set the production Site URL.
4. Add redirect URLs for:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`
   - the same two origins with `/reset-password` if your project uses an explicit allowlist
5. Enable email/password authentication and configure the email sender/templates.
6. Put the project URL, anon key, and service-role key in `.env.local` or Vercel.

The browser receives only the Supabase URL and anon key. The service-role key is server-only. RLS permits a signed-in user to read their own connection metadata, while token secrets, OAuth states, webhook receipts, and rate limits have no browser policy.

## Shopify app configuration

Create the app in Shopify's Dev Dashboard, select the appropriate public distribution for multi-merchant use, and use these values:

| Field                     | Value                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| App name                  | `Aladdyn Shopify Connector`                                              |
| App URL                   | `https://YOUR-PRODUCTION-DOMAIN`                                         |
| Embedded in Shopify Admin | Off                                                                      |
| Preferences URL           | `https://YOUR-PRODUCTION-DOMAIN/dashboard` or blank                      |
| Redirect URL              | `https://YOUR-PRODUCTION-DOMAIN/api/shopify/callback`                    |
| Webhooks API version      | `2026-07`                                                                |
| Required scopes           | `read_products,read_inventory,read_locations,read_orders,read_discounts` |
| Optional scopes           | Blank initially                                                          |
| Legacy install flow       | On for this direct authorization-URL flow                                |
| Shopify POS               | Off                                                                      |
| App proxy                 | Blank                                                                    |

Copy `shopify.app.toml.example` to `shopify.app.toml`, replace its placeholders, link it with Shopify CLI, and deploy the app configuration:

```powershell
shopify app config link
shopify app deploy
```

The phrase **legacy installation flow** remains Shopify's current configuration name for an app that requests scopes in the authorization URL. Shopify-managed installation is preferred for template/embedded apps; this application deliberately follows Shopify's current standalone authorization-code guide. See [app configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration) and [standalone app authentication](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps).

### Required scopes

| Scope            | Inspector data                                                   |
| ---------------- | ---------------------------------------------------------------- |
| `read_products`  | Products, variants, and collections                              |
| `read_inventory` | Inventory items and inventory quantities                         |
| `read_locations` | Locations and location summaries                                 |
| `read_orders`    | Safe operational order fields in Shopify's normal history window |
| `read_discounts` | Code discount definitions and status                             |

No write scope is requested.

## OAuth callback behavior

`GET /api/shopify/install` has two safe entry modes. Without a `shop`, it sends an authenticated Aladdyn user to the configured Shopify App Store listing, where Shopify handles login and store selection. With a `shop`, it accepts only Shopify's fresh, HMAC-signed launch request, validates store ownership, stores only a SHA-256 hash of a random OAuth state, and redirects to Shopify's authorization screen. The state expires after ten minutes and is atomically consumed once.

`GET /api/shopify/callback` performs these checks before persisting anything:

1. Strictly validates the `.myshopify.com` domain.
2. Verifies Shopify's callback HMAC with a constant-time comparison.
3. Rejects stale timestamps.
4. Atomically consumes the shop-bound and user-bound state hash.
5. Exchanges the code with `expiring=1`.
6. Verifies the actual shop identity and granted scopes through Admin GraphQL `2026-07`.
7. Encrypts the access and refresh token pair with AES-256-GCM and a fresh IV.
8. Persists verified metadata and encrypted credentials through one database function.

No token, code, HMAC, state, cookie, or secret is returned in a URL or browser response.

## Expiring offline tokens

New public apps must use expiring offline access tokens. Access tokens normally last about one hour and refresh tokens about 90 days, but this app uses Shopify's response values rather than hard-coding those durations. The server refreshes shortly before expiry and atomically replaces the encrypted pair.

If a refresh token is terminally rejected or expired, the connection becomes `needs_reauthorization` and the merchant must reconnect. See Shopify's [access token guide](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens).

## Data Inspector

`GET /api/shopify/data/{dataset}` accepts only these allowlisted dataset names:

- `shop`
- `scopes`
- `products`
- `variants`
- `collections`
- `inventory`
- `locations`
- `orders`
- `discounts`
- `protected-data`

Page sizes are constrained to 1–50. Cursors are validated, and forward/backward cursors cannot be mixed. Each response includes access status, cursor page information, fetch time, and GraphQL cost/throttle information.

## Protected customer data

The baseline app intentionally does not request customer scopes or query customer names, email addresses, phone numbers, or postal addresses.

- Customer profile fields require an appropriate customer scope and Shopify protected-customer-data approval.
- `read_orders` normally exposes a limited historical window.
- Older history requires `read_all_orders` and Shopify approval.
- Adding scopes requires deploying the Shopify configuration and reconnecting the merchant when necessary.
- Access is controlled by Shopify, not by an Aladdyn dashboard toggle.

The protected-data panel remains useful when access is blocked and explains the administrative action instead of faking a loading state.

## Webhooks and privacy

The single raw-body endpoint is:

```text
POST /api/shopify/webhooks
```

It verifies `X-Shopify-Hmac-Sha256` before parsing, validates the topic/shop/webhook ID headers, and uses `X-Shopify-Webhook-Id` for idempotency. The configuration subscribes to:

- `app/uninstalled`
- `customers/data_request`
- `customers/redact`
- `shop/redact`

`app/uninstalled` removes token material and marks the connection uninstalled. `shop/redact` deletes retained connection data. The baseline stores no customer profile payloads, so customer access/redaction topics are acknowledged without retaining the incoming personal payload. Shopify allows up to 30 days to complete mandatory privacy requests; this implementation performs its applicable cleanup synchronously. See [Shopify privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

Deploy the TOML configuration before testing. A route existing in code does not subscribe the app.

## Disconnect and uninstall

Disconnect requires explicit confirmation and removes the encrypted token pair locally. Shopify's current token documentation describes merchant uninstall (or client-secret revocation) as the event that ends Shopify-side token access; it does not document a per-install remote uninstall endpoint for this standalone app. The UI therefore tells the merchant to remove Aladdyn from Shopify Admin to complete Shopify-side revocation.

The `app/uninstalled` webhook converges the local connection to an uninstalled, tokenless state.

## Environment variables

| Variable                               | Exposure     | Purpose                                                 |
| -------------------------------------- | ------------ | ------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Browser-safe | Stable application origin and exact OAuth callback base |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser-safe | Supabase project URL                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Supabase publishable key protected by RLS               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Browser-safe | Optional legacy alternative to the publishable key      |
| `SUPABASE_SERVICE_ROLE_KEY`            | Server only  | Trusted database operations                             |
| `SHOPIFY_API_KEY`                      | Server only  | Shopify client ID used to build authorization requests  |
| `SHOPIFY_API_SECRET`                   | Server only  | OAuth and webhook HMAC verification, token exchange     |
| `SHOPIFY_APP_STORE_URL`                | Server only  | Final `https://apps.shopify.com/...` listing URL        |
| `SHOPIFY_API_VERSION`                  | Server only  | Must be `2026-07` for this release                      |
| `SHOPIFY_SCOPES`                       | Server only  | Comma-separated read-only scope set                     |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY`         | Server only  | Base64-encoded 32-byte AES key                          |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY_VERSION` | Server only  | Key version stored with ciphertext                      |
| `SHOPIFY_REQUEST_TIMEOUT_MS`           | Server only  | Shopify request timeout                                 |
| `DATA_INSPECTOR_PAGE_SIZE`             | Server only  | Default inspector page size                             |
| `OAUTH_STATE_TTL_SECONDS`              | Server only  | OAuth state lifetime                                    |

## Local HTTPS tunnel

Shopify needs an HTTPS callback for realistic local OAuth testing. Start Next.js, then use an HTTPS tunnel such as Cloudflare Tunnel or ngrok:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Temporarily set `NEXT_PUBLIC_APP_URL` to the generated HTTPS origin, add the exact `/api/shopify/callback` URL to Shopify's redirect allowlist, update the webhook destination through the app TOML/configuration, and restart Next.js. Tunnel URLs can change; never release a production Shopify app version pointing at an ephemeral tunnel.

## Vercel deployment order

1. Create the Supabase project.
2. Apply the committed SQL migration.
3. Configure the Supabase Site URL.
4. Add local and production auth redirect URLs.
5. Import this repository into Vercel.
6. Add every environment variable to the Production environment.
7. Deploy to a stable production hostname.
8. Set `NEXT_PUBLIC_APP_URL` to that exact hostname and redeploy.
9. Set Shopify's App URL.
10. Set the exact Shopify callback URL.
11. Configure the webhook URL and API version.
12. Deploy/release the Shopify app configuration.
13. Create a fresh Aladdyn tester account.
14. Install on a Shopify development/test store.
15. Verify every inspector dataset.
16. Verify reconnect, disconnect, and uninstall behavior.

Do not release with placeholder URLs or a Vercel preview URL.

## Testing and validation

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit tests cover domain/SSRF validation, OAuth URL/state helpers, callback and webhook HMACs, AES-GCM round trips and tamper rejection, scope comparison, dataset/cursor allowlisting, and secret redaction. The Playwright smoke test covers the public landing/signup path on desktop and mobile.

Credential-dependent Shopify/Supabase acceptance checks cannot be completed without test credentials and a development store. They are listed in `VALIDATION_REPORT.md` and must be run before production release.

## Troubleshooting

### App Store listing not configured

Set `SHOPIFY_APP_STORE_URL` to Aladdyn's final `https://apps.shopify.com/...` listing URL. Public-app installation must start from Shopify's listing so Shopify can authenticate the merchant and select the store; Aladdyn does not ask the merchant to type a shop domain.

### OAuth callback rejected

Confirm `NEXT_PUBLIC_APP_URL` and Shopify's allowlisted redirect URL are exact, including HTTPS and path. Start a new install if the ten-minute state expired; states cannot be replayed.

### Missing scope

Update both `SHOPIFY_SCOPES` and `[access_scopes]` in the app TOML, deploy the Shopify app configuration, and reconnect. Protected scopes can still require Shopify approval.

### No old orders

`read_orders` does not guarantee full historical access. Request and obtain approval for `read_all_orders` only when the product genuinely requires it.

### Token revoked or refresh failed

Reconnect the store. A terminal refresh-token failure cannot be repaired from the dashboard without merchant authorization.

### Compliance webhook check fails

Confirm the TOML version is deployed, the endpoint accepts direct POST requests without redirects, forged HMAC requests return `401`, and the production URL has a valid TLS certificate.

## Security notes

- AES-256-GCM uses a fresh 12-byte IV for every encrypted token pair.
- OAuth state is random, hashed at rest, expiring, shop-bound, user-bound, and consumed atomically.
- The callback verifies HMAC before exchanging the code.
- Webhooks verify HMAC against the unmodified raw body.
- Every data and connection action re-authenticates the Supabase user and checks ownership.
- Shopify hosts are derived only from strict `.myshopify.com` normalization.
- Sensitive keys never use `NEXT_PUBLIC_`.
- Browser errors use safe codes and diagnostic IDs; secret-like values are redacted from structured logs.
- Security headers deny framing, MIME sniffing, sensitive browser capabilities, and arbitrary connection origins.
- No customer profile payload is queried or retained by the baseline.

## Encryption-key rotation

`key_version` is stored beside every encrypted token pair. To rotate safely, deploy code that can decrypt the old version and encrypt with the new version, re-encrypt records in a controlled server-side job, verify counts, then retire the old key. Do not simply replace the environment key: existing ciphertext would become unreadable and every store would require reauthorization.

## Reference implementation note

The ADRIG `shopify-frontend` and `shofipy-backend` repositories were reviewed for the existing connect/dashboard intent and data shapes. This connector intentionally replaces their legacy browser token handling, loose domain checks, plaintext token persistence, and unbounded full-store fetching with server-only encrypted credentials, strict ownership, replay-safe OAuth, and cursor pagination.
