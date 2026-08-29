export const runtime = "nodejs";

import { requireUser } from "@/lib/auth/require-user";
import {
  ALADDYN_UCP_AGENT_PROFILE,
  getAgentProfileUrl,
} from "@shopify-adapter/ucp/agent-profile";
import { getShopifyAgentToken } from "@shopify-adapter/ucp/auth";
import { discoverCommerceCapabilities } from "@shopify-adapter/ucp/discovery";
import { ShopifyMcpClient } from "@shopify-adapter/ucp/mcp-client";
import { ucpProfileSchema } from "@/lib/commerce/schemas";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";

export async function POST() {
  try {
    const user = await requireUser();
    const connection = await getConnectionForUser(user.id);
    if (!connection || connection.status !== "connected") {
      throw new AppError("CONNECTION_NOT_FOUND", "No store is connected", 404);
    }
    const capabilities = await discoverCommerceCapabilities(
      connection.shop_domain,
      { force: true },
    );
    const profileUrl = getAgentProfileUrl();
    const localProfileHealthy = ucpProfileSchema.safeParse(
      ALADDYN_UCP_AGENT_PROFILE,
    ).success;
    let publishedProfileHealthy = false;
    try {
      const response = await fetch(profileUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      publishedProfileHealthy =
        response.ok &&
        ucpProfileSchema.safeParse(await response.json()).success;
    } catch {
      publishedProfileHealthy = false;
    }

    let agentToken: "healthy" | "error" | "not_configured" = "not_configured";
    if (
      process.env.SHOPIFY_UCP_CLIENT_ID &&
      process.env.SHOPIFY_UCP_CLIENT_SECRET
    ) {
      try {
        await getShopifyAgentToken();
        agentToken = "healthy";
      } catch {
        agentToken = "error";
      }
    }

    const client = new ShopifyMcpClient({
      endpoint: capabilities.mcpEndpoint,
      shopDomain: connection.shop_domain,
    });
    const tools = await client.listTools();
    const toolNames = new Set(
      tools
        .map((tool) =>
          tool && typeof tool === "object" && "name" in tool
            ? String(tool.name)
            : "",
        )
        .filter(Boolean),
    );

    return Response.json(
      {
        store: connection.shop_domain,
        discoveryUrl: capabilities.discoveryUrl,
        version: capabilities.version,
        mcpEndpoint: capabilities.mcpEndpoint,
        catalog: {
          search_catalog:
            capabilities.catalog.search && toolNames.has("search_catalog"),
          lookup_catalog:
            capabilities.catalog.lookup && toolNames.has("lookup_catalog"),
          get_product:
            capabilities.catalog.product && toolNames.has("get_product"),
        },
        cart: {
          create_cart:
            capabilities.cart.supported && toolNames.has("create_cart"),
          get_cart: capabilities.cart.supported && toolNames.has("get_cart"),
          update_cart:
            capabilities.cart.supported && toolNames.has("update_cart"),
          cancel_cart:
            capabilities.cart.supported && toolNames.has("cancel_cart"),
        },
        checkout: {
          create_checkout:
            capabilities.checkout.supported && toolNames.has("create_checkout"),
          get_checkout:
            capabilities.checkout.supported && toolNames.has("get_checkout"),
          continue_url: capabilities.checkout.supported,
          complete_checkout: "disabled",
        },
        agent: {
          profile:
            localProfileHealthy && publishedProfileHealthy
              ? "healthy"
              : "error",
          token: agentToken,
          profileUrl,
        },
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
