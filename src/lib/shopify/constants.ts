import "server-only";

export const SHOPIFY_API_VERSION = "2026-07" as const;

export const BASELINE_SCOPES = [
  "read_products",
  "read_inventory",
  "read_locations",
  "read_orders",
  "read_discounts",
] as const;

export const CONNECTION_STATUSES = [
  "connected",
  "verification_failed",
  "access_revoked",
  "uninstalled",
  "disconnected",
  "needs_reauthorization",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const OAUTH_CALLBACK_MAX_AGE_SECONDS = 300;
export const TOKEN_REFRESH_SKEW_SECONDS = 90;
