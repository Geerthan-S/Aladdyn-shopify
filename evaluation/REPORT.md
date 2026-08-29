# Commerce Agent Evaluation Report

Date: 2026-08-27

## Automated release scenarios

| Scenario        | Assertion                                                                          | Result |
| --------------- | ---------------------------------------------------------------------------------- | ------ |
| Product search  | A constrained query for black shirts under 2000 maps to `search_products`          | Pass   |
| Personalization | A prior running-shoe purchase affects category and purchase memory                 | Pass   |
| Cart            | A validated AI `create_cart` call maps to the internal `add_to_cart` action        | Pass   |
| Security        | Prompt injection requesting API keys is rejected before provider or tool execution | Pass   |

Run the executable scenarios with `npm run eval`. These tests validate routing,
schema, memory, and security behavior without calling a paid model or a live
merchant store.

## Live acceptance still required

The automated suite cannot prove recommendation quality, live Shopify catalog
accuracy, or checkout behavior without configured Supabase, OpenRouter, Shopify
UCP credentials, and an installed development store. Run the credential-gated
Playwright commerce journey and complete the manual acceptance checklist in
`VALIDATION_REPORT.md` before production release.
