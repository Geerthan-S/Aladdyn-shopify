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
| Vitest unit/integration tests   | Pass — 28 tests across 6 files                                  |
| Next.js production build        | Pass — Next.js 16.3.3 production build                          |
| Local HTTP/runtime smoke test   | Pass — `/` and `/connect` returned HTTP 200 on `127.0.0.1:3000` |
| Playwright desktop/mobile smoke | Pass — 2 Chromium projects                                      |
| Rendered HTML secret scan       | Pass                                                            |
| Security header smoke test      | Pass — CSP present and `X-Powered-By` absent                    |

## Credential-dependent acceptance still required

- Apply the migration to a real Supabase project.
- Verify signup email delivery, email confirmation, login, recovery, and cookie refresh.
- Install from a stable HTTPS origin on a Shopify development store.
- Verify callback HMAC/state/code exchange with Shopify's real signed callback.
- Verify expiring access-token and refresh-token rotation.
- Verify shop, scopes, products, variants, collections, inventory, locations, orders, and discounts against the development store's `2026-07` schema.
- Verify pagination in both directions with more than one page of records.
- Trigger `app/uninstalled` and the three mandatory compliance topics through Shopify CLI/Dev Dashboard.
- Verify reconnect preserves the previous usable credential when a new attempt is cancelled.
- Verify disconnect removes local encrypted credentials and merchant uninstall revokes Shopify-side access.
- Verify cross-user ownership conflicts with two real Supabase accounts.

No live Shopify or Supabase verification is claimed without those credentials.
