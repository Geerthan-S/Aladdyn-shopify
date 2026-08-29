import type { ProviderCapabilities } from "@commerce-agent/providers/types";

export const SHOPIFY_UCP_VERSION = "2026-04-08" as const;

export type ShopifyCapabilities = ProviderCapabilities & {
  mcpEndpoint: string;
  discoveryUrl: string;
};

export const CAPABILITY_NAMES = {
  catalogSearch: "dev.ucp.shopping.catalog.search",
  catalogLookup: "dev.ucp.shopping.catalog.lookup",
  cart: "dev.ucp.shopping.cart",
  checkout: "dev.ucp.shopping.checkout",
} as const;

export function normalizeCapabilities(
  capabilityNames: Set<string>,
  mcpEndpoint: string,
  discoveryUrl: string,
): ShopifyCapabilities {
  const search = capabilityNames.has(CAPABILITY_NAMES.catalogSearch);
  const lookup = capabilityNames.has(CAPABILITY_NAMES.catalogLookup);
  return {
    provider: "shopify",
    version: SHOPIFY_UCP_VERSION,
    catalog: { search, lookup, product: lookup },
    cart: {
      supported: capabilityNames.has(CAPABILITY_NAMES.cart),
      semantics: "replace",
    },
    checkout: {
      supported: capabilityNames.has(CAPABILITY_NAMES.checkout),
      mode: "handoff",
      directCompletion: false,
    },
    orders: { supported: false },
    endpoint: mcpEndpoint,
    metadata: { mcpEndpoint },
    mcpEndpoint,
    discoveryUrl,
  };
}
