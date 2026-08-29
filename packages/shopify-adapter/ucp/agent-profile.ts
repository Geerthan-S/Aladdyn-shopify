import { CAPABILITY_NAMES } from "@shopify-adapter/capabilities";
import { SHOPIFY_UCP_VERSION } from "@shopify-adapter/capabilities";

const supportedCapability = [{ version: SHOPIFY_UCP_VERSION }];

export const ALADDYN_UCP_AGENT_PROFILE = {
  ucp: {
    version: SHOPIFY_UCP_VERSION,
    capabilities: {
      [CAPABILITY_NAMES.catalogSearch]: supportedCapability,
      [CAPABILITY_NAMES.catalogLookup]: supportedCapability,
      [CAPABILITY_NAMES.cart]: supportedCapability,
      [CAPABILITY_NAMES.checkout]: supportedCapability,
    },
  },
} as const;

export function getAgentProfileUrl() {
  const configured = process.env.ALADDYN_UCP_PROFILE_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(configured || "/.well-known/ucp", appUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("ALADDYN_UCP_PROFILE_URL must use HTTPS");
  }
  return url.toString();
}
