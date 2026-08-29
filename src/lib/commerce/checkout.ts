import "server-only";

export type { CommerceCheckout } from "@commerce-agent/providers/types";

export function assertSecureCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".myshopify.com")) {
    throw new Error("Checkout must use a secure Shopify URL");
  }
  return url.toString();
}
