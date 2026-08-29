import "server-only";

import { CommerceError } from "@commerce-agent/tools/errors";
import {
  searchShopifyCatalog,
  getShopifyProduct,
} from "@shopify-adapter/ucp/catalog";
import {
  createShopifyCart,
  getShopifyCart,
  updateShopifyCart,
} from "@shopify-adapter/ucp/cart";
import {
  createShopifyCheckout,
  getShopifyCheckout,
} from "@shopify-adapter/ucp/checkout";
import { discoverCommerceCapabilities } from "@shopify-adapter/ucp/discovery";
import { ShopifyMcpClient } from "@shopify-adapter/ucp/mcp-client";
import type { AuthoritativeCartState } from "@commerce-agent/providers/types";
import type { CommerceConnector } from "@commerce-agent/providers/commerce-connector";

export async function createShopifyCommerceProvider(
  storeDomain: string,
): Promise<CommerceConnector & { listTools(): Promise<unknown[]> }> {
  const capabilities = await discoverCommerceCapabilities(storeDomain);
  const client = new ShopifyMcpClient({
    endpoint: capabilities.mcpEndpoint,
    shopDomain: storeDomain,
  });
  return {
    capabilities: () => capabilities,
    searchProducts: (input: unknown) => {
      if (!capabilities.catalog.search) throw unsupported("catalog search");
      return searchShopifyCatalog(client, storeDomain, input);
    },
    getProduct: (productId: string) => {
      if (!capabilities.catalog.product) throw unsupported("product lookup");
      return getShopifyProduct(client, storeDomain, productId);
    },
    createCart: (
      state: AuthoritativeCartState,
      version: number,
      idempotencyKey: string,
    ) => {
      if (!capabilities.cart.supported) throw unsupported("cart");
      return createShopifyCart(
        client,
        storeDomain,
        state,
        version,
        idempotencyKey,
      );
    },
    getCart: (
      cartId: string,
      state: AuthoritativeCartState,
      version: number,
    ) => {
      if (!capabilities.cart.supported) throw unsupported("cart");
      return getShopifyCart(client, storeDomain, cartId, state, version);
    },
    updateCart: (
      cartId: string,
      state: AuthoritativeCartState,
      version: number,
      idempotencyKey: string,
    ) => {
      if (!capabilities.cart.supported) throw unsupported("cart");
      return updateShopifyCart(
        client,
        storeDomain,
        cartId,
        state,
        version,
        idempotencyKey,
      );
    },
    createCheckout: (
      cartId: string,
      state: AuthoritativeCartState,
      idempotencyKey: string,
    ) => {
      if (!capabilities.checkout.supported) throw unsupported("checkout");
      return createShopifyCheckout(
        client,
        storeDomain,
        cartId,
        state,
        idempotencyKey,
      );
    },
    getCheckout: (checkoutId: string, cartId: string) => {
      if (!capabilities.checkout.supported) throw unsupported("checkout");
      return getShopifyCheckout(client, storeDomain, checkoutId, cartId);
    },
    listTools: () => client.listTools(),
  };
}

function unsupported(name: string) {
  return new CommerceError(
    "CAPABILITY_UNAVAILABLE",
    `This store does not support ${name}`,
    409,
  );
}
