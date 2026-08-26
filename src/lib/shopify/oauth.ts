import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { normalizeShopDomain } from "@/lib/shopify/domain";

export type ShopifyTokenResponse = {
  access_token: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
};

export function generateOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function buildAuthorizationUrl(shopInput: string, state: string) {
  const env = getServerEnv();
  const shop = normalizeShopDomain(shopInput);
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  url.searchParams.set("scope", env.SHOPIFY_SCOPES);
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/shopify/callback", env.NEXT_PUBLIC_APP_URL).toString(),
  );
  url.searchParams.set("state", state);
  return url;
}

async function parseTokenResponse(
  response: Response,
): Promise<ShopifyTokenResponse> {
  if (!response.ok)
    throw new Error(`Shopify token request failed (${response.status})`);
  const data = (await response.json()) as Partial<ShopifyTokenResponse>;
  if (
    !data.access_token ||
    !data.refresh_token ||
    !data.scope ||
    !data.expires_in ||
    !data.refresh_token_expires_in
  ) {
    throw new Error("Shopify returned an incomplete token response");
  }
  return data as ShopifyTokenResponse;
}

export async function exchangeAuthorizationCode(
  shopInput: string,
  code: string,
) {
  const env = getServerEnv();
  const shop = normalizeShopDomain(shopInput);
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code,
      expiring: "1",
    }),
    signal: AbortSignal.timeout(env.SHOPIFY_REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  return parseTokenResponse(response);
}

export async function refreshOfflineToken(
  shopInput: string,
  refreshToken: string,
) {
  const env = getServerEnv();
  const shop = normalizeShopDomain(shopInput);
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(env.SHOPIFY_REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  return parseTokenResponse(response);
}
