import "server-only";

import {
  quantitySchema,
  shopifyCartIdSchema,
  shopifyVariantIdSchema,
} from "@/lib/commerce/schemas";
import { ShopifyMcpClient } from "@/lib/commerce/shopify/ucp/mcp-client";
import { normalizeCart } from "@/lib/commerce/shopify/ucp/normalizers";
import { providerIdempotencyKey } from "@/lib/commerce/shopify/ucp/idempotency";
import type {
  AuthoritativeCartState,
  CommerceCart,
} from "@/lib/commerce/types";

function cartPayload(state: AuthoritativeCartState) {
  return {
    line_items: state.lineItems.map((line) => ({
      quantity: quantitySchema.min(1).parse(line.quantity),
      item: { id: shopifyVariantIdSchema.parse(line.variantId) },
    })),
    context: state.context,
    attribution: state.attribution,
  };
}

export async function createShopifyCart(
  client: ShopifyMcpClient,
  merchant: string,
  state: AuthoritativeCartState,
  version: number,
  idempotencyKey: string,
): Promise<CommerceCart> {
  const result = await client.call<unknown>(
    "create_cart",
    { cart: cartPayload(state) },
    { idempotencyKey: providerIdempotencyKey(idempotencyKey) },
  );
  return normalizeCart(result, merchant, version, state);
}

export async function getShopifyCart(
  client: ShopifyMcpClient,
  merchant: string,
  cartId: string,
  state: AuthoritativeCartState,
  version: number,
): Promise<CommerceCart> {
  const result = await client.call<unknown>("get_cart", {
    id: shopifyCartIdSchema.parse(cartId),
  });
  return normalizeCart(result, merchant, version, state);
}

export async function updateShopifyCart(
  client: ShopifyMcpClient,
  merchant: string,
  cartId: string,
  state: AuthoritativeCartState,
  version: number,
  idempotencyKey: string,
): Promise<CommerceCart> {
  const result = await client.call<unknown>(
    "update_cart",
    {
      id: shopifyCartIdSchema.parse(cartId),
      cart: cartPayload(state),
    },
    { idempotencyKey: providerIdempotencyKey(idempotencyKey) },
  );
  return normalizeCart(result, merchant, version, state);
}

export async function cancelShopifyCart(
  client: ShopifyMcpClient,
  cartId: string,
  idempotencyKey: string,
) {
  return client.call<unknown>(
    "cancel_cart",
    { id: shopifyCartIdSchema.parse(cartId) },
    { idempotencyKey: providerIdempotencyKey(idempotencyKey) },
  );
}
