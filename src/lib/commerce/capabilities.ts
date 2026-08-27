import type { ProviderCapabilities } from "@/lib/commerce/types";
import { UCP_VERSION } from "@/lib/commerce/types";

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
): ProviderCapabilities {
  const search = capabilityNames.has(CAPABILITY_NAMES.catalogSearch);
  const lookup = capabilityNames.has(CAPABILITY_NAMES.catalogLookup);
  return {
    provider: "shopify",
    version: UCP_VERSION,
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
    mcpEndpoint,
    discoveryUrl,
  };
}
