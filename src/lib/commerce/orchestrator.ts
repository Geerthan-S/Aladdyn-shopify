import "server-only";

import {
  addCartLine,
  changeCartLineQuantity,
  removeCartLine,
} from "@commerce-agent/tools/cart-state";
import { CommerceError } from "@commerce-agent/tools/errors";
import {
  beginCommerceOperation,
  finishCommerceOperation,
  getOrCreateCommerceSession,
  saveSearchContext,
  updateCheckoutState,
} from "@/lib/commerce/sessions";
import { createShopifyCommerceProvider } from "@shopify-adapter";
import {
  commerceIdempotencyKey,
  requestHash,
} from "@shopify-adapter/ucp/idempotency";
import {
  searchProductsSchema,
  shopifyProductIdSchema,
} from "@/lib/commerce/schemas";
import type {
  AuthoritativeCartState,
  CommerceCart,
  CommerceCheckout,
  CommerceProduct,
} from "@commerce-agent/providers/types";
import { buildProductDiscovery } from "@commerce-agent/recommendation/discovery";

export async function createCommerceOrchestrator(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  storeDomain: string;
}) {
  const provider = await createShopifyCommerceProvider(input.storeDomain);
  let session = await getOrCreateCommerceSession({
    userId: input.userId,
    conversationId: input.conversationId,
    storeDomain: input.storeDomain,
    capabilities: provider.capabilities(),
  });

  async function discoverProducts(raw: unknown) {
    const constraints = searchProductsSchema.parse(raw);
    const candidates = await provider.searchProducts({
      ...constraints,
      limit: 10,
    });
    const discovery = buildProductDiscovery(candidates, constraints);
    await saveSearchContext({
      userId: input.userId,
      sessionId: session.id,
      products: discovery.matchingProducts,
    });
    session = {
      ...session,
      lastProducts: discovery.matchingProducts,
      lastVariantId: null,
    };
    return discovery;
  }

  async function searchProducts(raw: unknown) {
    return (await discoverProducts(raw)).visibleProducts;
  }

  function expandProducts() {
    return buildProductDiscovery(session.lastProducts, {
      query: "previous matching products",
      displayMode: "expanded",
      strict: false,
    });
  }

  async function getProduct(productId: string) {
    const product = await provider.getProduct(
      shopifyProductIdSchema.parse(productId),
    );
    await saveSearchContext({
      userId: input.userId,
      sessionId: session.id,
      products: [product],
      lastVariantId:
        product.variants.length === 1 ? product.variants[0].variantId : null,
    });
    session = {
      ...session,
      lastProducts: [product],
      lastVariantId:
        product.variants.length === 1 ? product.variants[0].variantId : null,
    };
    return product;
  }

  async function mutateCart(
    operationType: string,
    desired: AuthoritativeCartState,
  ) {
    const key = commerceIdempotencyKey(
      input.conversationId,
      input.messageId,
      operationType,
      session.cartVersion,
    );
    const begun = await beginCommerceOperation({
      session,
      operationType,
      idempotencyKey: key,
      requestHash: requestHash(desired),
      desiredCartState: desired,
      mutatesCart: true,
    });
    if (begun.replayed) {
      if (begun.operationStatus === "completed" && begun.response) {
        return begun.response as CommerceCart;
      }
      throw new CommerceError(
        "CART_CONFLICT",
        "This cart update is already being processed",
        409,
        true,
      );
    }
    session = begun.session;
    try {
      const cart = session.cartId
        ? await provider.updateCart(
            session.cartId,
            desired,
            session.cartVersion,
            key,
          )
        : await provider.createCart(desired, session.cartVersion, key);
      await finishCommerceOperation({
        userId: input.userId,
        operationId: begun.operationId,
        status: "completed",
        response: cart,
        cartId: cart.cartId,
        providerCart: cart,
      });
      session = { ...session, cartId: cart.cartId, cartState: desired };
      return cart;
    } catch (error) {
      await finishCommerceOperation({
        userId: input.userId,
        operationId: begun.operationId,
        status: "failed",
        errorCode: error instanceof CommerceError ? error.code : "MCP_ERROR",
      }).catch(() => undefined);
      throw error;
    }
  }

  async function addToCart(variantId: string, quantity: number) {
    const cart = await mutateCart(
      "add_to_cart",
      addCartLine(session.cartState, variantId, quantity),
    );
    await saveSearchContext({
      userId: input.userId,
      sessionId: session.id,
      products: session.lastProducts,
      lastVariantId: variantId,
    });
    session = { ...session, lastVariantId: variantId };
    return cart;
  }

  async function removeFromCart(variantId: string) {
    return mutateCart(
      "remove_from_cart",
      removeCartLine(session.cartState, variantId),
    );
  }

  async function changeQuantity(variantId: string, quantity: number) {
    return mutateCart(
      "change_quantity",
      changeCartLineQuantity(session.cartState, variantId, quantity),
    );
  }

  async function viewCart() {
    if (!session.cartId)
      return emptyCart(session.storeDomain, session.cartState);
    return provider.getCart(
      session.cartId,
      session.cartState,
      session.cartVersion,
    );
  }

  async function checkout() {
    if (!session.cartId || session.cartState.lineItems.length === 0) {
      throw new CommerceError("CART_EMPTY", "Your cart is empty", 409);
    }
    const key = commerceIdempotencyKey(
      input.conversationId,
      input.messageId,
      "checkout",
      session.cartVersion,
    );
    const begun = await beginCommerceOperation({
      session,
      operationType: "checkout",
      idempotencyKey: key,
      requestHash: requestHash({ cartId: session.cartId }),
      desiredCartState: session.cartState,
      mutatesCart: false,
    });
    if (begun.replayed) {
      if (begun.operationStatus === "completed" && begun.response) {
        return begun.response as CommerceCheckout;
      }
      throw new CommerceError(
        "CART_CONFLICT",
        "Checkout is already being created",
        409,
        true,
      );
    }
    try {
      const checkoutResult = await provider.createCheckout(
        session.cartId,
        session.cartState,
        key,
      );
      await finishCommerceOperation({
        userId: input.userId,
        operationId: begun.operationId,
        status: "completed",
        response: checkoutResult,
        checkoutId: checkoutResult.checkoutId,
        checkoutStatus: checkoutResult.status,
        continueUrl: checkoutResult.continueUrl,
      });
      return checkoutResult;
    } catch (error) {
      await finishCommerceOperation({
        userId: input.userId,
        operationId: begun.operationId,
        status: "failed",
        errorCode:
          error instanceof CommerceError ? error.code : "CHECKOUT_UNAVAILABLE",
      }).catch(() => undefined);
      throw error;
    }
  }

  async function getCheckoutStatus() {
    if (!session.checkoutId || !session.cartId) {
      throw new CommerceError(
        "CHECKOUT_UNAVAILABLE",
        "No checkout exists yet",
        404,
      );
    }
    const checkoutResult = await provider.getCheckout(
      session.checkoutId,
      session.cartId,
    );
    await updateCheckoutState({
      userId: input.userId,
      sessionId: session.id,
      checkoutId: checkoutResult.checkoutId,
      status: checkoutResult.status,
      continueUrl: checkoutResult.continueUrl,
    });
    return checkoutResult;
  }

  return {
    capabilities: provider.capabilities,
    get session() {
      return session;
    },
    searchProducts,
    discoverProducts,
    expandProducts,
    getProduct,
    viewCart,
    addToCart,
    removeFromCart,
    changeQuantity,
    checkout,
    getCheckoutStatus,
  };
}

function emptyCart(
  merchant: string,
  state: AuthoritativeCartState,
): CommerceCart {
  return {
    provider: "shopify",
    merchant,
    cartId: "",
    version: 0,
    lines: [],
    totals: [],
    currency: state.context.currency ?? "INR",
    continueUrl: null,
    attribution: state.attribution,
  };
}

export function selectVariant(
  products: CommerceProduct[],
  requestedOption?: string,
) {
  const variants = products[0]?.variants ?? [];
  if (!requestedOption) return variants.length === 1 ? variants[0] : null;
  const needle = requestedOption.trim().toLowerCase();
  return (
    variants.find(
      (variant) =>
        variant.title.toLowerCase() === needle ||
        variant.options.some((option) => option.value.toLowerCase() === needle),
    ) ?? null
  );
}
