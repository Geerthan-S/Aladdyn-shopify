import "server-only";

import { CommerceError } from "@commerce-agent/tools/errors";
import {
  createCommerceOrchestrator,
  selectVariant,
} from "@/lib/commerce/orchestrator";
import type { GenieResponse } from "@commerce-agent/providers/types";
import type { ExplicitAction } from "@commerce-agent/tools/actions";
export type { ExplicitAction } from "@commerce-agent/tools/actions";

const injectionSignals = [
  /ignore (all|any|the|your) (previous|prior|system) instructions?/i,
  /system prompt/i,
  /developer message/i,
  /<\/?(?:tool|system|assistant)[^>]*>/i,
  /execute (?:this )?(?:code|command|instruction)/i,
];

export async function routeGenieMessage(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  storeDomain: string;
  message: string;
  action?: ExplicitAction;
}): Promise<GenieResponse> {
  const commerce = await createCommerceOrchestrator(input);
  if (input.action) return executeAction(commerce, input, input.action);

  if (injectionSignals.some((pattern) => pattern.test(input.message))) {
    throw new CommerceError(
      "INVALID_COMMERCE_INPUT",
      "I can help search this store, manage your cart, or start secure checkout.",
      400,
    );
  }

  const message = input.message.trim();
  if (/^(show|view) (me )?(my |the )?cart\b/i.test(message)) {
    return executeAction(commerce, input, { tool: "view_cart", input: {} });
  }
  if (/^(checkout status|status of (my )?checkout)\b/i.test(message)) {
    return executeAction(commerce, input, {
      tool: "get_checkout_status",
      input: {},
    });
  }
  if (
    /^(checkout|check out|buy now|i(?:'m| am) ready to (?:buy|checkout))\b/i.test(
      message,
    )
  ) {
    return executeAction(commerce, input, { tool: "checkout", input: {} });
  }

  const ordinal = message.match(
    /^(?:show|view|get)(?: me)? (?:the )?(first|second|third|[1-9]|10)(?: one| product)?$/i,
  );
  if (ordinal) {
    const index = ordinalIndex(ordinal[1]);
    const product = commerce.session.lastProducts[index];
    if (!product) {
      throw new CommerceError(
        "INVALID_COMMERCE_INPUT",
        "Search for products first, then choose one from the results.",
        400,
      );
    }
    return executeAction(commerce, input, {
      tool: "get_product",
      input: { productId: product.productId },
    });
  }

  if (/^(add|put) one more\b/i.test(message)) {
    const variantId = commerce.session.lastVariantId;
    if (!variantId) return missingVariant();
    return executeAction(commerce, input, {
      tool: "add_to_cart",
      input: { variantId, quantity: 1 },
    });
  }

  if (/^remove one\b/i.test(message)) {
    const variantId = commerce.session.lastVariantId;
    if (!variantId) return missingVariant();
    const cart = await commerce.viewCart();
    const line = cart.lines.find((item) => item.variantId === variantId);
    if (!line) return missingVariant();
    return executeAction(commerce, input, {
      tool: "change_quantity",
      input: { variantId, quantity: Math.max(0, line.quantity - 1) },
    });
  }

  const add = message.match(
    /^(?:add|put)(?: the)?(?: size| option)?\s+([\w -]+?)(?: to (?:my |the )?cart)?$/i,
  );
  if (add) {
    const variant = selectVariant(commerce.session.lastProducts, add[1]);
    if (!variant || !variant.available) return missingVariant();
    return executeAction(commerce, input, {
      tool: "add_to_cart",
      input: { variantId: variant.variantId, quantity: 1 },
    });
  }

  const search = message.match(
    /^(?:show|find|search|look for)(?: me)?\s+(.+)$/i,
  );
  if (search) {
    const maxPrice = parseMaxPrice(message);
    const query = search[1]
      .replace(/\s+under\s+(?:₹|rs\.?|inr\s*)?[\d,.]+.*$/i, "")
      .trim();
    return executeAction(commerce, input, {
      tool: "search_products",
      input: {
        query,
        ...(maxPrice !== undefined ? { maxPrice, currency: "INR" } : {}),
        country: "IN",
        limit: 6,
      },
    });
  }

  throw new CommerceError(
    "INVALID_COMMERCE_INPUT",
    "Try asking me to find a product, show your cart, add an option, or checkout.",
    400,
  );
}

async function executeAction(
  commerce: Awaited<ReturnType<typeof createCommerceOrchestrator>>,
  input: { conversationId: string },
  action: ExplicitAction,
): Promise<GenieResponse> {
  switch (action.tool) {
    case "search_products": {
      const products = await commerce.searchProducts(action.input);
      return {
        conversationId: input.conversationId,
        tool: action.tool,
        message: products.length
          ? `I found ${products.length} product${products.length === 1 ? "" : "s"} in this store.`
          : "I couldn't find a matching product in this store.",
        products,
      };
    }
    case "recommend_products": {
      const products = await commerce.searchProducts(action.input);
      return {
        conversationId: input.conversationId,
        tool: action.tool,
        message: products.length
          ? `I found ${products.length} personalized option${products.length === 1 ? "" : "s"}.`
          : "I couldn't find an available match for those preferences.",
        products,
      };
    }
    case "get_product": {
      const product = await commerce.getProduct(action.input.productId);
      return {
        conversationId: input.conversationId,
        tool: action.tool,
        message: `${product.title} has ${product.variants.length} option${product.variants.length === 1 ? "" : "s"}.`,
        products: [product],
      };
    }
    case "view_cart": {
      const cart = await commerce.viewCart();
      return cartResponse(
        input.conversationId,
        action.tool,
        cart,
        "Here’s your cart.",
      );
    }
    case "add_to_cart": {
      const cart = await commerce.addToCart(
        action.input.variantId,
        action.input.quantity,
      );
      return cartResponse(
        input.conversationId,
        action.tool,
        cart,
        "Added to your cart.",
      );
    }
    case "remove_from_cart": {
      const cart = await commerce.removeFromCart(action.input.variantId);
      return cartResponse(
        input.conversationId,
        action.tool,
        cart,
        "Removed from your cart.",
      );
    }
    case "change_quantity": {
      const cart = await commerce.changeQuantity(
        action.input.variantId,
        action.input.quantity,
      );
      return cartResponse(
        input.conversationId,
        action.tool,
        cart,
        "Your cart is updated.",
      );
    }
    case "checkout": {
      const checkout = await commerce.checkout();
      return {
        conversationId: input.conversationId,
        tool: action.tool,
        message: "Your cart is ready ✅",
        checkout,
      };
    }
    case "get_checkout_status": {
      const checkout = await commerce.getCheckoutStatus();
      return {
        conversationId: input.conversationId,
        tool: action.tool,
        message: `Your checkout is ${checkout.status.replaceAll("_", " ")}.`,
        checkout,
      };
    }
  }
}

function cartResponse(
  conversationId: string,
  tool: GenieResponse["tool"],
  cart: NonNullable<GenieResponse["cart"]>,
  message: string,
): GenieResponse {
  return { conversationId, tool, message, cart };
}

function missingVariant(): never {
  throw new CommerceError(
    "VARIANT_UNAVAILABLE",
    "Choose an available product option first.",
    409,
  );
}

function ordinalIndex(value: string) {
  const words: Record<string, number> = { first: 0, second: 1, third: 2 };
  return words[value.toLowerCase()] ?? Number(value) - 1;
}

function parseMaxPrice(message: string) {
  const match = message.match(/\bunder\s+(?:₹|rs\.?|inr\s*)?([\d,.]+)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(amount) ? amount : undefined;
}
