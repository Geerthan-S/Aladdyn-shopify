import { describe, expect, it, vi } from "vitest";
import {
  createShopifyCart,
  getShopifyCart,
  updateShopifyCart,
} from "@/lib/commerce/shopify/ucp/cart";
import {
  createShopifyCheckout,
  getShopifyCheckout,
} from "@/lib/commerce/shopify/ucp/checkout";
import type { ShopifyMcpClient } from "@/lib/commerce/shopify/ucp/mcp-client";
import type { AuthoritativeCartState } from "@/lib/commerce/types";

const merchant = "test.myshopify.com";
const cartId = "gid://shopify/Cart/abc?key=secret";
const checkoutId = "gid://shopify/Checkout/abc?key=secret";
const state: AuthoritativeCartState = {
  lineItems: [
    { variantId: "gid://shopify/ProductVariant/1", quantity: 1 },
    { variantId: "gid://shopify/ProductVariant/2", quantity: 2 },
  ],
  context: { currency: "INR", address_country: "IN" },
  attribution: {
    utm_source: "aladdyn",
    utm_medium: "conversational_commerce",
    utm_content: "web_chat",
    activity_id_tag: "conversation_id",
    activity_id_value: "conversation-1",
  },
};

describe("Shopify UCP cart tool mapping", () => {
  it("creates a cart with the complete authoritative state", async () => {
    const client = mockClient(cartResponse());
    await createShopifyCart(client, merchant, state, 1, "idem");
    expect(client.call).toHaveBeenCalledWith(
      "create_cart",
      {
        cart: {
          line_items: [
            { quantity: 1, item: { id: "gid://shopify/ProductVariant/1" } },
            { quantity: 2, item: { id: "gid://shopify/ProductVariant/2" } },
          ],
          context: state.context,
          attribution: state.attribution,
        },
      },
      { idempotencyKey: expect.stringMatching(/^[a-f0-9-]{36}$/) },
    );
  });

  it("gets an existing cart by provider ID", async () => {
    const client = mockClient(cartResponse());
    const result = await getShopifyCart(client, merchant, cartId, state, 2);
    expect(client.call).toHaveBeenCalledWith("get_cart", { id: cartId });
    expect(result.cartId).toBe(cartId);
  });

  it("uses full replacement semantics for cart updates", async () => {
    const client = mockClient(cartResponse());
    await updateShopifyCart(client, merchant, cartId, state, 3, "idem");
    const args = client.call.mock.calls[0][1] as Record<string, unknown>;
    expect(args).toMatchObject({
      id: cartId,
      cart: {
        line_items: state.lineItems.map((line) => ({
          quantity: line.quantity,
          item: { id: line.variantId },
        })),
        attribution: state.attribution,
      },
    });
  });
});

describe("Shopify UCP checkout mapping", () => {
  it("creates checkout from a cart in authenticated handoff mode", async () => {
    const client = mockClient(checkoutResponse());
    const checkout = await createShopifyCheckout(
      client,
      merchant,
      cartId,
      "idem",
    );
    expect(client.call).toHaveBeenCalledWith(
      "create_checkout",
      { checkout: { cart_id: cartId } },
      {
        idempotencyKey: expect.stringMatching(/^[a-f0-9-]{36}$/),
        authenticated: true,
      },
    );
    expect(checkout.continueUrl).toBe("https://test.myshopify.com/cart/c/abc");
  });

  it("gets checkout status without exposing complete_checkout", async () => {
    const client = mockClient(checkoutResponse());
    const checkout = await getShopifyCheckout(
      client,
      merchant,
      checkoutId,
      cartId,
    );
    expect(client.call).toHaveBeenCalledWith(
      "get_checkout",
      { id: checkoutId },
      { authenticated: true },
    );
    expect(checkout.status).toBe("requires_escalation");
    expect(client.call).not.toHaveBeenCalledWith(
      "complete_checkout",
      expect.anything(),
      expect.anything(),
    );
  });
});

function mockClient(value: unknown) {
  return {
    call: vi.fn().mockResolvedValue(value),
  } as unknown as ShopifyMcpClient & { call: ReturnType<typeof vi.fn> };
}

function cartResponse() {
  return {
    id: cartId,
    currency: "INR",
    line_items: state.lineItems.map((line, index) => ({
      id: `gid://shopify/CartLine/${index + 1}?cart=abc`,
      quantity: line.quantity,
      item: { id: line.variantId, title: `Item ${index + 1}`, price: 10000 },
    })),
    totals: [{ type: "total", amount: 30000, display_text: "Total" }],
    attribution: state.attribution,
    continue_url: "https://test.myshopify.com/cart/c/abc",
  };
}

function checkoutResponse() {
  return {
    id: checkoutId,
    status: "requires_escalation",
    currency: "INR",
    totals: [{ type: "total", amount: 30000, display_text: "Total" }],
    continue_url: "https://test.myshopify.com/cart/c/abc",
  };
}
