import "server-only";

import { CommerceError } from "@/lib/commerce/errors";

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

function readExpiry(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + 55 * 60 * 1000;
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: number };
    return typeof parsed.exp === "number"
      ? parsed.exp * 1000
      : Date.now() + 55 * 60 * 1000;
  } catch {
    return Date.now() + 55 * 60 * 1000;
  }
}

async function mintAgentToken(fetcher: typeof fetch): Promise<CachedToken> {
  const clientId = process.env.SHOPIFY_UCP_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_UCP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new CommerceError(
      "AGENT_AUTH_FAILED",
      "Shopify UCP agent credentials are not configured",
      503,
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(
      "https://api.shopify.com/auth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      console.warn("commerce.ucp.auth", { status: response.status });
      throw new CommerceError(
        "AGENT_AUTH_FAILED",
        "Shopify agent authentication failed",
        503,
        response.status >= 500,
      );
    }
    const body = (await response.json()) as { access_token?: unknown };
    if (
      typeof body.access_token !== "string" ||
      body.access_token.length < 20
    ) {
      throw new CommerceError(
        "AGENT_AUTH_FAILED",
        "Shopify returned an invalid agent token",
        503,
      );
    }
    console.info("commerce.ucp.auth", { status: "ok" });
    return {
      value: body.access_token,
      expiresAt: readExpiry(body.access_token),
    };
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    throw new CommerceError(
      "AGENT_AUTH_FAILED",
      "Shopify agent authentication is unavailable",
      503,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function getShopifyAgentToken(fetcher: typeof fetch = fetch) {
  if (cachedToken && cachedToken.expiresAt - 5 * 60 * 1000 > Date.now()) {
    return cachedToken.value;
  }
  inflight ??= mintAgentToken(fetcher).finally(() => {
    inflight = null;
  });
  cachedToken = await inflight;
  return cachedToken.value;
}

export function clearAgentTokenCache() {
  cachedToken = null;
  inflight = null;
}
