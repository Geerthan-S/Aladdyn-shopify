# Aladdyn Shopify Connector

A standalone Next.js application that lets an authenticated Aladdyn user install a read-only Shopify app and inspect store data without exposing Shopify credentials to the browser.

The merchant journey is:

```text
Create or log in to Aladdyn
→ click Connect with Shopify
→ while the app is a draft, open the configured Shopify development store
→ after publication, Shopify handles store selection from the App Store listing
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
  ├─ service-role-only rate-limit buckets
  ├─ normalized product and conversation data
  ├─ shopper behavior and preference signals
  └─ store-filtered pgvector product and policy retrieval
```

Shopify GraphQL calls occur only in `src/lib/shopify/admin-graphql.ts`. There is no arbitrary GraphQL endpoint.

Shopper commerce is a separate path. The authenticated `/api/chat` route invokes
the Genie tool router, which calls a provider-neutral commerce orchestrator. The
Shopify adapter discovers the merchant's `/.well-known/ucp` profile, negotiates
UCP `2026-04-08`, and uses the discovered MCP endpoint for catalog, cart, and
checkout handoff. Genie never calls Shopify tools directly, and the Admin
GraphQL connector remains unchanged.

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

The production `shopify.app.toml` is committed with Aladdyn's public client ID, stable application URL, callback, read-only scopes, and webhook subscriptions. Link it with Shopify CLI and deploy the app configuration:

```powershell
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

`GET /api/shopify/install` has three safe entry modes. Without a `shop`, it sends an authenticated Aladdyn user to the configured Shopify App Store listing. While the app is still a draft and has no listing, it starts authorization only for the server-configured Shopify development store. With a `shop` in the request, it accepts only Shopify's fresh, HMAC-signed launch request. Every authorization path validates store ownership, stores only a SHA-256 hash of a random OAuth state, and redirects to Shopify's authorization screen. The state expires after ten minutes and is atomically consumed once.

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
- `products/create`
- `products/update`
- `products/delete`

`app/uninstalled` removes token material and marks the connection uninstalled.
`shop/redact` deletes retained connection data. `customers/redact` removes the
matching protected customer/order context, shopper events, profiles, and
conversations. Product create/update notifications refetch the authoritative
Admin GraphQL product before updating normalized data and its embedding;
product deletion removes the normalized row and cascades its embedding. The
manual sync remains the reconciliation path because webhook delivery is not a
complete historical sync. Shopify allows up to 30 days to complete mandatory
privacy requests. See [Shopify privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance).

Deploy the TOML configuration before testing. A route existing in code does not subscribe the app.

## Disconnect and uninstall

Disconnect requires explicit confirmation. While the current offline token is still available, Aladdyn calls Shopify's `appUninstall` mutation; only after Shopify confirms the uninstall (or reports that access was already revoked) does Aladdyn remove its encrypted token pair and mark the connection disconnected. A temporary Shopify/network failure preserves the token so the merchant can retry safely.

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
| `SHOPIFY_TEST_STORE_DOMAIN`            | Server only  | Draft-only development store `*.myshopify.com` domain   |
| `SHOPIFY_API_VERSION`                  | Server only  | Must be `2026-07` for this release                      |
| `SHOPIFY_SCOPES`                       | Server only  | Comma-separated read-only scope set                     |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY`         | Server only  | Base64-encoded 32-byte AES key                          |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY_VERSION` | Server only  | Key version stored with ciphertext                      |
| `SHOPIFY_REQUEST_TIMEOUT_MS`           | Server only  | Shopify request timeout                                 |
| `DATA_INSPECTOR_PAGE_SIZE`             | Server only  | Default inspector page size                             |
| `OAUTH_STATE_TTL_SECONDS`              | Server only  | OAuth state lifetime                                    |
| `SHOPIFY_UCP_CLIENT_ID`                | Server only  | Optional agent ID for authenticated Shopify MCP calls   |
| `SHOPIFY_UCP_CLIENT_SECRET`            | Server only  | Optional agent secret; never returned or logged         |
| `ALADDYN_UCP_PROFILE_URL`              | Server only  | Public UCP agent profile passed in every MCP call       |
| `OPENROUTER_API_KEY`                   | Server only  | OpenRouter credential for AI generation                 |
| `CHAT_MODEL`                           | Server only  | OpenRouter model ID used for shopping conversations     |
| `FAST_MODEL`                           | Server only  | OpenRouter model ID used for structured profile updates |
| `EMBEDDING_MODEL`                      | Server only  | Replaceable embedding model used by the RAG adapter     |
| `EMBEDDING_DIMENSIONS`                 | Server only  | Must match migration 004 vector dimensions (`1536`)     |
| `SHOPIFY_SYNC_MAX_PRODUCTS`            | Server only  | Product safety cap for one manual sync                  |

## Genie UCP / MCP commerce

Apply `supabase/migrations/002_ucp_commerce.sql` after the base connector
migration. It creates user-scoped conversational sessions, authoritative cart
state, optimistic cart versions, and idempotent operation records. Browser code
cannot write these tables; all mutations pass through the authenticated chat
route and server-only commerce layer.

Aladdyn publishes its agent profile at `GET /.well-known/ucp`. It advertises
only catalog search/lookup, cart, and checkout capabilities for UCP
`2026-04-08`. Merchant discovery is never hardcoded: the adapter validates and
caches `https://{shop}/.well-known/ucp`, then accepts only the same merchant's
HTTPS `/api/ucp/mcp` endpoint.

The normalized Genie tools are `search_products`, `get_product`, `view_cart`,
`add_to_cart`, `remove_from_cart`, `change_quantity`, `checkout`, and
`get_checkout_status`. Shopify provider names remain below the abstraction.
Cart updates always send the full authoritative line-item, context, and
attribution state because UCP `update_cart` uses replacement semantics.

Checkout is handoff-only. Aladdyn calls `create_checkout` only when the shopper
asks to buy, validates the returned HTTPS `continue_url`, persists the checkout
state, and renders a **Continue Secure Checkout** link. Aladdyn does not expose
or call `complete_checkout`, collect card details, or handle payment tokens.

The UCP inspector is available at `/dashboard/ucp`. Its health check verifies
discovery, the published Aladdyn profile, agent authentication, and advertised
tool availability without creating a cart or checkout.

## AI commerce prototype

Apply `supabase/migrations/003_ai_commerce_prototype.sql` after migrations 001
and 002. Supabase Auth remains the user system; the migration adds multi-store
merchant records, normalized products, protected customer/order context,
conversations, messages, customer profiles, and cart-session relations. These
tables are service-role only and are never queried directly by browser code.

The runtime flow is:

```text
Customer chat UI
  -> authenticated /api/chat route
  -> provider-neutral AI orchestrator
  -> controlled context builder + personalization
  -> provider-neutral commerce tools
  -> Shopify UCP/MCP for live catalog, cart, and checkout
```

The merchant dashboard exposes a manual **Sync products** control. Sync uses
Admin GraphQL, normalizes products/variants/images/collections/options, and
stores only compact fields needed for retrieval. Customer data is skipped
unless `read_customers` is granted and Shopify allows protected customer data;
order data is skipped unless `read_orders` is granted. Optional protected-data
failures do not invalidate a successful product sync.

`src/lib/ai/provider.ts` is the stable AI contract. The current adapter uses
OpenRouter's chat-completions-compatible endpoint and supports normal
completions, SSE streaming, function tools, and strict JSON Schema output.
Neither model ID is hardcoded in application code: configure `CHAT_MODEL` and
`FAST_MODEL` in the environment. The committed `.env.example` supplies the
prototype defaults.

Apply `supabase/migrations/004_agent_intelligence.sql` after migration 003. It
enables pgvector and adds service-role-only `shopping_events`,
`merchant_knowledge`, and `product_embeddings` tables plus exact,
store-filtered similarity functions.

The production intelligence flow is:

```text
User message
  -> deterministic intent classification
  -> recent conversation + explicit profile + behavior memory
  -> store-filtered product and merchant-knowledge retrieval
  -> compact AI context (retrieved content is untrusted data)
  -> replaceable AI provider
  -> schema-validated tool request
  -> owner/store/action permission check
  -> provider-neutral commerce orchestrator
  -> Shopify UCP/MCP live search, cart, and checkout
```

Product sync generates embeddings only for changed product documents. Chat
retrieval sends a small candidate set rather than the entire catalog. RAG
candidates never authorize product, price, inventory, cart, or checkout claims;
those facts must be confirmed by a live commerce tool.

Merchant knowledge is managed through authenticated `GET /api/knowledge` and
`POST /api/knowledge`. Supported records are shipping, returns, payment, FAQ, brand
voice, and policies. Shopper signals may be recorded through authenticated
`POST /api/shopping-events`; commerce tool execution also records search,
product-view, add-cart, and remove-cart signals. Metadata is allowlisted and
bounded before storage.

The system prompt is composed from `src/lib/ai/rules/global.md`, `commerce.md`,
`personalization.md`, and `security.md`, followed by the compact store/customer
context. The chat provider interface in `src/lib/ai/provider.ts` is unchanged.
The embedding interface is separately replaceable, so OpenRouter can later
become the Aladdyn Agent Runtime while the Shopify commerce provider can become
an Aladdyn MCP connector.

## Local HTTPS tunnel

Shopify needs an HTTPS callback for realistic local OAuth testing. Start Next.js, then use an HTTPS tunnel such as Cloudflare Tunnel or ngrok:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Temporarily set `NEXT_PUBLIC_APP_URL` to the generated HTTPS origin, add the exact `/api/shopify/callback` URL to Shopify's redirect allowlist, update the webhook destination through the app TOML/configuration, and restart Next.js. Tunnel URLs can change; never release a production Shopify app version pointing at an ephemeral tunnel.

## Vercel deployment order

1. Create the Supabase project.
2. Apply the committed SQL migrations in numeric order (001 through 004).
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
16. Run a product sync and verify its dashboard status.
17. Test AI search, personalization, cart creation, and checkout handoff.
18. Verify reconnect, disconnect, and uninstall behavior.

Do not release with placeholder URLs or a Vercel preview URL.

## Testing and validation

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run eval
npm run build
npm run test:e2e
```

Unit and integration tests cover domain/SSRF validation, OAuth and webhook
HMACs, encryption, scopes, secret redaction, AI provider behavior, context
assembly, vector retrieval, behavior weighting, tool permissions, and product
normalization. `npm run eval` executes the release scenarios documented in
`evaluation/REPORT.md`. Playwright covers public/auth boundaries and contains a
credential-gated installed-store journey for sync, recommendation, and cart
creation.

Credential-dependent Shopify/Supabase acceptance checks cannot be completed without test credentials and a development store. They are listed in `VALIDATION_REPORT.md` and must be run before production release.

## Troubleshooting

### Draft app testing

You do not need a Shopify App Store URL while the app is a draft. Leave `SHOPIFY_APP_STORE_URL` blank and set:

```env
SHOPIFY_TEST_STORE_DOMAIN=your-development-store.myshopify.com
```

Use only a development store owned by your Shopify organization. In the Shopify Dev Dashboard, open the app and use **Install app** to select or create that store. After the public listing is approved, set `SHOPIFY_APP_STORE_URL` and remove `SHOPIFY_TEST_STORE_DOMAIN`; the listing automatically takes precedence if both are temporarily present.

### App Store listing not configured after publication

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
- Customer profiles contain only explicit, non-sensitive shopping preferences.
- Protected Shopify customer/order context is scope-gated and never sent as a raw dump.

## Encryption-key rotation

`key_version` is stored beside every encrypted token pair. To rotate safely, deploy code that can decrypt the old version and encrypt with the new version, re-encrypt records in a controlled server-side job, verify counts, then retire the old key. Do not simply replace the environment key: existing ciphertext would become unreadable and every store would require reauthorization.

## Reference implementation note

The ADRIG `shopify-frontend` and `shofipy-backend` repositories were reviewed for the existing connect/dashboard intent and data shapes. This connector intentionally replaces their legacy browser token handling, loose domain checks, plaintext token persistence, and unbounded full-store fetching with server-only encrypted credentials, strict ownership, replay-safe OAuth, and cursor pagination.
