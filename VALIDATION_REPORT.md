# Validation Report

Generated for the Aladdyn Shopify Connector implementation.

## Automated checks

The final results are recorded after the full validation run:

| Check                           | Result                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| Dependency installation/audit   | Pass — 422 packages audited, 0 vulnerabilities                  |
| Prettier format check           | Pass                                                            |
| ESLint                          | Pass with zero warnings                                         |
| TypeScript                      | Pass                                                            |
| Vitest unit/integration/eval    | Pass — 115 tests across 20 files                                |
| Agent release evaluation        | Pass — 4 required scenarios                                     |
| Live Shopify UCP probe          | Pass — search, product, cart, and checkout handoff              |
| Next.js production build        | Pass — Next.js 16.3.3 production build                          |
| Local HTTP/runtime smoke test   | Pass — `/` and `/connect` returned HTTP 200 on `127.0.0.1:3000` |
| Playwright desktop/mobile smoke | Pass — 6; live commerce journey skipped twice without secrets   |
| Rendered HTML secret scan       | Pass                                                            |
| Security header smoke test      | Pass — CSP present and `X-Powered-By` absent                    |

## Credential-dependent acceptance still required

- Apply migrations 003 and 004 to the real Supabase project. Migration 004
  enables pgvector and creates behavior, knowledge, embedding, and retrieval
  objects.
- Configure `OPENROUTER_API_KEY`, `CHAT_MODEL`, `FAST_MODEL`,
  `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSIONS=1536`.
- Shopify UCP agent credentials remain optional for this draft test store's
  public catalog, cart, and hosted-checkout handoff. Configure them before
  testing authenticated agent-only capabilities.
- Verify signup email delivery, email confirmation, login, recovery, and cookie refresh.
- Install from a stable HTTPS origin on a Shopify development store.
- Verify callback HMAC/state/code exchange with Shopify's real signed callback.
- Verify expiring access-token and refresh-token rotation.
- Verify shop, scopes, products, variants, collections, inventory, locations, orders, and discounts against the development store's `2026-07` schema.
- Verify pagination in both directions with more than one page of records.
- Trigger `app/uninstalled` and the three mandatory compliance topics through Shopify CLI/Dev Dashboard.
- Deploy the Shopify app configuration and verify product create, update, and
  delete webhook delivery, retry behavior, normalized product updates, and
  embedding refresh.
- Add shipping, returns, payment, FAQ, brand voice, and policy knowledge and
  verify store-filtered retrieval against real pgvector data.
- Run the credential-gated Playwright commerce journey with
  `E2E_MERCHANT_EMAIL`, `E2E_MERCHANT_PASSWORD`, and `E2E_PRODUCT_QUERY`.
- Verify reconnect preserves the previous usable credential when a new attempt is cancelled.
- Verify disconnect removes local encrypted credentials and merchant uninstall revokes Shopify-side access.
- Verify cross-user ownership conflicts with two real Supabase accounts.

No live Shopify or Supabase verification is claimed without those credentials.
