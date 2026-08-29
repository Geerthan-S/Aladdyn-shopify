# Aladdyn Commerce Agent Extraction Guide

## Purpose

This repository remains a validation prototype. The reusable commerce logic is now separated from the Next.js UI, Supabase persistence, OpenRouter configuration, and Shopify transport so it can be moved into Aladdyn without carrying prototype infrastructure with it.

## Package boundary

```text
Next.js prototype (src/)
  composition, routes, UI, Supabase repositories, test-store behavior
       |
       +--> packages/commerce-agent
       |      provider-neutral chatbot and commerce contracts
       |
       +--> packages/shopify-adapter
              Shopify UCP discovery, MCP transport, schemas, normalization
```

`packages/commerce-agent` must not import from `src`, Shopify, OpenRouter, Supabase, or Next.js. `packages/shopify-adapter` may depend on the commerce-agent contracts, but the commerce-agent must never depend on Shopify.

## What moves into Aladdyn

Copy `packages/commerce-agent` as the reusable engine:

- `ai/orchestrator.ts`: provider-neutral streaming and tool-call loop.
- `ai/prompt.ts`: pure system-prompt assembly.
- `context/builder.ts` and `context/intent.ts`: controlled context assembly, conversation summarization, and intent classification.
- `personalization/preferences.ts`: behavior-to-preference reduction.
- `personalization/recommendation.ts`: recommendation query construction.
- `personalization/customer-memory.ts`: persistence boundary for customer memory.
- `tools/actions.ts`, `tools/cart-state.ts`, and `tools/router.ts`: commerce action contracts, connector-neutral cart state, authorization boundary, and tool execution shell.
- `providers/ai-provider.ts`: `AIProvider` contract.
- `providers/commerce-connector.ts`: `CommerceConnector` contract.
- `providers/product-provider.ts`: `ProductProvider` contract.
- `providers/product-normalizer.ts`: normalized product boundary.
- `providers/types.ts`: normalized products, carts, checkout, capabilities, sessions, and chatbot responses.

Copy `packages/shopify-adapter` only if Aladdyn will continue supporting Shopify UCP/MCP. It contains Shopify domain validation, UCP version negotiation, agent authentication, JSON-RPC MCP transport, cart/checkout payloads, Shopify GID validation, and Shopify response normalization.

## What stays in the prototype

The following code is application glue or validation-only code and should not be extracted as engine code:

- `src/app` and `src/components`: prototype pages, routes, chat UI, connection UI, inspector, and sync controls.
- `src/lib/ai/openrouter.ts`: the current OpenRouter adapter.
- `src/lib/ai/provider.ts`: prototype composition that selects OpenRouter.
- `src/lib/ai/context-builder.ts`: Supabase-backed context repository and prototype store/conversation persistence.
- `src/lib/ai/prompts.ts` and `src/lib/ai/rules`: prototype rule-file loading and current prompt content. Aladdyn may reuse the content after product review, but not the filesystem loader.
- `src/lib/personalization/customer-profile.ts` and `events.ts`: Supabase persistence adapters.
- `src/lib/commerce/sessions.ts` and `orchestrator.ts`: prototype session/idempotency persistence and Shopify composition.
- `src/lib/tools/router.ts`: prototype authorization lookup, event tracking, and route integration.
- `src/lib/shopify`, Shopify API routes, OAuth, webhooks, and sync code: connector application behavior, not the provider-neutral engine.
- `evaluation`, `tests`, `tests/e2e`, `TESTING_CHECKLIST.md`, and prototype migrations: validation assets. Keep them as reference fixtures until Aladdyn has equivalent contract tests.

## Required interfaces

### AIProvider

The chatbot uses `AIProvider.complete`, `AIProvider.stream`, and `AIProvider.structured`. The engine does not know which model vendor is behind the interface.

### CommerceConnector

The engine receives catalog, cart, and checkout operations through `CommerceConnector`. Connector-specific IDs are opaque strings inside the engine and are validated by the selected connector.

### ProductProvider

Catalog search and product lookup are independently replaceable through `ProductProvider`.

### CustomerMemory

Customer profile, history, and event persistence are exposed through `CustomerMemory`. Aladdyn can implement this with its own database without changing recommendation logic.

## Replacement points

### OpenRouter to Aladdyn AI Runtime

1. Implement `AIProvider` in Aladdyn.
2. Change the Aladdyn composition root to construct that implementation.
3. Pass it to `runAIToolLoop`.
4. Leave chatbot messages, tool schemas, streaming handling, and tool execution logic unchanged.

The current prototype composition root is `src/lib/ai/provider.ts`; this is the only place that constructs `OpenRouterProvider`.

### Shopify MCP to Aladdyn MCP Connector

1. Implement `CommerceConnector` (and therefore `ProductProvider`) around the Aladdyn MCP connector.
2. Normalize connector responses into `CommerceProduct`, `CommerceCart`, and `CommerceCheckout`.
3. Validate provider-specific identifiers and checkout URLs inside the adapter.
4. Replace `createShopifyCommerceProvider` in the Aladdyn composition root.
5. Leave AI orchestration, context, personalization, and chatbot tool selection unchanged.

## Dependencies

`packages/commerce-agent` is intentionally framework- and vendor-neutral and has no runtime dependency on Next.js, Supabase, Shopify, OpenRouter, or Zod.

`packages/shopify-adapter` currently depends on:

- `packages/commerce-agent` contracts and errors.
- Zod for Shopify/UCP payload validation.
- `fetch`, `URL`, `AbortController`, and Web Crypto from the server runtime.
- Environment values used for Shopify agent authentication and the public agent-profile URL.
- `server-only` guards supplied by the current Next.js host.

When extracting the Shopify adapter outside Next.js, replace the `server-only` guards with the equivalent Aladdyn server-boundary mechanism.

## Aladdyn integration sequence

1. Copy `packages/commerce-agent` and establish it as an internal Aladdyn package.
2. Implement Aladdyn's `AIProvider` and `CustomerMemory` adapters.
3. Decide whether to copy `packages/shopify-adapter` or implement an Aladdyn MCP connector from `CommerceConnector`.
4. Create one Aladdyn composition root that injects the selected AI provider, commerce connector, and customer-memory repository.
5. Port the approved prompt rules and tool definitions; do not port the prototype filesystem loader.
6. Port contract tests for search, recommendation, prior-purchase context, add-to-cart, and checkout handoff.
7. Compare normalized response fixtures before redirecting any Aladdyn traffic.
8. Remove the prototype only after the Aladdyn contract tests and the five validation scenarios pass against the same store fixtures.

## Extraction acceptance criteria

- Changing the AI provider requires changing only the composition root and the new provider adapter.
- Changing the commerce connector requires changing only the composition root and connector adapter.
- Chatbot orchestration imports no Shopify, OpenRouter, Next.js, or Supabase module.
- Connector-specific IDs and response formats do not leak into commerce-agent logic.
- The five prototype flows remain behaviorally unchanged.
- No UI, analytics, monitoring, scaling, or production administration code is introduced by this cleanup.
