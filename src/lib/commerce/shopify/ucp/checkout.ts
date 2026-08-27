import "server-only";

import {
  shopifyCartIdSchema,
  shopifyCheckoutIdSchema,
} from "@/lib/commerce/schemas";
import { ShopifyMcpClient } from "@/lib/commerce/shopify/ucp/mcp-client";
import { providerIdempotencyKey } from "@/lib/commerce/shopify/ucp/idempotency";
import { normalizeCheckout } from "@/lib/commerce/shopify/ucp/normalizers";

export async function createShopifyCheckout(
  client: ShopifyMcpClient,
  merchant: string,
  cartId: string,
  idempotencyKey: string,
) {
  const validCartId = shopifyCartIdSchema.parse(cartId);
  const result = await client.call<unknown>(
    "create_checkout",
    {
      // Shopify's live 2026-04-08 tool schema places cart_id in checkout.
      checkout: { cart_id: validCartId },
    },
    {
      idempotencyKey: providerIdempotencyKey(idempotencyKey),
      authenticated: true,
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
    { authenticated: true },
  );
  return normalizeCheckout(result, merchant, cartId);
}
