import "server-only";

import {
  normalizeCapabilities,
  SHOPIFY_UCP_VERSION,
  type ShopifyCapabilities,
} from "@shopify-adapter/capabilities";
import { CommerceError } from "@commerce-agent/tools/errors";
import { ucpProfileSchema } from "@shopify-adapter/schemas";
import { normalizeShopDomain } from "@shopify-adapter/domain";

type CacheEntry = { value: ShopifyCapabilities; expiresAt: number };
const discoveryCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function cacheTtl(response: Response) {
  const match = response.headers.get("cache-control")?.match(/max-age=(\d+)/i);
  if (!match) return DEFAULT_TTL_MS;
  return Math.min(Number(match[1]) * 1000, 60 * 60 * 1000);
}

function validateMerchantEndpoint(endpoint: string, shopDomain: string) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.hostname !== shopDomain ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/api/ucp/mcp" ||
    url.search ||
    url.hash
  ) {
    throw new CommerceError(
      "DISCOVERY_INVALID",
      "The merchant advertised an unsafe UCP endpoint",
      502,
    );
  }
  return url.toString();
}

export async function discoverCommerceCapabilities(
  storeDomain: string,
  options: { force?: boolean; fetcher?: typeof fetch } = {},
) {
  const shopDomain = normalizeShopDomain(storeDomain);
  const cached = discoveryCache.get(shopDomain);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const fetcher = options.fetcher ?? fetch;
  const discoveryUrl = `https://${shopDomain}/.well-known/ucp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let response = await fetcher(discoveryUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CommerceError(
        "DISCOVERY_INVALID",
        "Shopify UCP discovery is unavailable",
        502,
        response.status >= 500,
      );
    }
    let profile = ucpProfileSchema.safeParse(await response.json());
    if (!profile.success) {
      throw new CommerceError(
        "DISCOVERY_INVALID",
        "Shopify returned an invalid UCP profile",
        502,
      );
    }

    if (profile.data.ucp.version !== SHOPIFY_UCP_VERSION) {
      const versionUrl =
        profile.data.ucp.supported_versions?.[SHOPIFY_UCP_VERSION];
      if (!versionUrl) {
        throw new CommerceError(
          "CAPABILITY_UNAVAILABLE",
          `Store does not support UCP ${SHOPIFY_UCP_VERSION}`,
          409,
        );
      }
      const resolved = new URL(versionUrl);
      if (
        resolved.protocol !== "https:" ||
        resolved.hostname !== shopDomain ||
        resolved.username ||
        resolved.password
      ) {
        throw new CommerceError(
          "DISCOVERY_INVALID",
          "The merchant advertised an unsafe version profile",
          502,
        );
      }
      response = await fetcher(resolved, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new CommerceError(
          "DISCOVERY_INVALID",
          "The negotiated UCP profile is unavailable",
          502,
        );
      }
      profile = ucpProfileSchema.safeParse(await response.json());
      if (
        !profile.success ||
        profile.data.ucp.version !== SHOPIFY_UCP_VERSION
      ) {
        throw new CommerceError(
          "DISCOVERY_INVALID",
          "The negotiated UCP profile is invalid",
          502,
        );
      }
    }

    const service = profile.data.ucp.services?.["dev.ucp.shopping"]?.find(
      (candidate) =>
        candidate.version === SHOPIFY_UCP_VERSION &&
        candidate.transport === "mcp",
    );
    if (!service?.endpoint) {
      throw new CommerceError(
        "CAPABILITY_UNAVAILABLE",
        "Store does not advertise Shopify UCP MCP",
        409,
      );
    }
    const endpoint = validateMerchantEndpoint(service.endpoint, shopDomain);
    const names = new Set(
      Object.entries(profile.data.ucp.capabilities)
        .filter(([, definitions]) =>
          definitions.some((item) => item.version === SHOPIFY_UCP_VERSION),
        )
        .map(([name]) => name),
    );
    const value = normalizeCapabilities(names, endpoint, discoveryUrl);
    discoveryCache.set(shopDomain, {
      value,
      expiresAt: Date.now() + cacheTtl(response),
    });
    console.info("commerce.ucp.discovery", {
      shopDomain,
      version: value.version,
      status: "ok",
    });
    return value;
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CommerceError(
        "MCP_TIMEOUT",
        "Shopify UCP discovery timed out",
        504,
        true,
      );
    }
    throw new CommerceError(
      "DISCOVERY_INVALID",
      "Shopify UCP discovery failed",
      502,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function clearDiscoveryCache() {
  discoveryCache.clear();
}
