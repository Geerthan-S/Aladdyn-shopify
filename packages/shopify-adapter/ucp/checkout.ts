import "server-only";

import {
  shopifyCartIdSchema,
  shopifyCheckoutIdSchema,
} from "@shopify-adapter/schemas";
import { ShopifyMcpClient } from "@shopify-adapter/ucp/mcp-client";
import { providerIdempotencyKey } from "@shopify-adapter/ucp/idempotency";
import { normalizeCheckout } from "@shopify-adapter/ucp/normalizers";
import { shopifyCartPayload } from "@shopify-adapter/ucp/cart";
import { isShopifyAgentAuthConfigured } from "@shopify-adapter/ucp/auth";
import type { AuthoritativeCartState } from "@commerce-agent/providers/types";

export async function createShopifyCheckout(
  client: ShopifyMcpClient,
  merchant: string,
  cartId: string,
  state: AuthoritativeCartState,
  idempotencyKey: string,
) {
  const validCartId = shopifyCartIdSchema.parse(cartId);
  const result = await client.call<unknown>(
    "create_checkout",
    {
      checkout: {
        cart_id: validCartId,
        ...shopifyCartPayload(state),
      },
    },
    {
      idempotencyKey: providerIdempotencyKey(idempotencyKey),
      authenticated: isShopifyAgentAuthConfigured(),
      // Shopify can return a valid handoff URL with a recoverable buyer-contact
      // message. The normalizer still validates the checkout ID, status, and URL.
      allowStructuredError: true,
    },
  );
  return normalizeCheckout(result, merchant, validCartId);
}

export async function getShopifyCheckout(
  client: ShopifyMcpClient,
  merchant: string,
  checkoutId: string,
  cartId: string,
) {
  const result = await client.call<unknown>(
    "get_checkout",
    { id: shopifyCheckoutIdSchema.parse(checkoutId) },
    { authenticated: isShopifyAgentAuthConfigured() },
  );
  return normalizeCheckout(result, merchant, cartId);
}
