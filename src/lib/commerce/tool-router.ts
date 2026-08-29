import "server-only";

import { CommerceError } from "@commerce-agent/tools/errors";
import {
  createCommerceOrchestrator,
  selectVariant,
} from "@/lib/commerce/orchestrator";
import type { GenieResponse } from "@commerce-agent/providers/types";
import type { ExplicitAction } from "@commerce-agent/tools/actions";
import type { ProductDiscovery } from "@commerce-agent/recommendation/discovery";
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
  const deterministicAction = inferDeterministicAction(message);
  if (deterministicAction) {
    return executeAction(commerce, input, deterministicAction);
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

  throw new CommerceError(
    "INVALID_COMMERCE_INPUT",
    "Try asking me to find a product, show your cart, add an option, or checkout.",
    400,
  );
}

export function inferDeterministicAction(
  message: string,
): ExplicitAction | null {
  const normalized = message.trim();
  if (injectionSignals.some((pattern) => pattern.test(normalized))) return null;
  if (/^(show|view) (me )?(my |the )?cart\b/i.test(normalized)) {
    return { tool: "view_cart", input: {} };
  }
  if (/^(checkout status|status of (my )?checkout)\b/i.test(normalized)) {
    return { tool: "get_checkout_status", input: {} };
  }
  if (
    /^(checkout|check out|buy now|i(?:'m| am) ready to (?:buy|checkout))\b/i.test(
      normalized,
    )
  ) {
    return { tool: "checkout", input: {} };
  }
  if (
    /^(?:show more|more options|what else|show everything)\??$/i.test(
      normalized,
    )
  ) {
    return { tool: "expand_results", input: {} };
  }

  const displayMode =
    /\b(?:show all|show everything|list all|more options|show more|what else)\b/i.test(
      normalized,
    )
      ? "expanded"
      : "recommended";
  const between = normalized.match(
    /\bbetween\s*(?:₹|rs\.?|inr\s*)?([\d,.]+)\s*(k)?\s+(?:and|to)\s*(?:₹|rs\.?|inr\s*)?([\d,.]+)\s*(k)?/i,
  );
  const upperBound = normalized.match(
    /\b(?:under|below|less\s+than)\s*(?:₹|rs\.?|inr\s*)?([\d,.]+)\s*(k)?/i,
  );
  const around = normalized.match(
    /\baround\s*(?:₹|rs\.?|inr\s*)?([\d,.]+)\s*(k)?/i,
  );
  const hasSearchLanguage =
    /^(?:show|find|search|look for|list)(?: me)?\b/i.test(normalized) ||
    /\b(?:products?|items?|options?)\b/i.test(normalized);
  if (!hasSearchLanguage && !between && !upperBound && !around) return null;

  const minPrice = between ? parsePrice(between[1], between[2]) : undefined;
  const maxPrice = between
    ? parsePrice(between[3], between[4])
    : upperBound
      ? parsePrice(upperBound[1], upperBound[2])
      : undefined;
  const targetPrice = around ? parsePrice(around[1], around[2]) : undefined;
  const cleanedQuery = normalized
    .replace(
      /\bbetween\s*(?:₹|rs\.?|inr\s*)?[\d,.]+\s*k?\s+(?:and|to)\s*(?:₹|rs\.?|inr\s*)?[\d,.]+\s*k?/gi,
      " ",
    )
    .replace(
      /\b(?:under|below|less\s+than|around)\s*(?:₹|rs\.?|inr\s*)?[\d,.]+\s*k?/gi,
      " ",
    )
    .replace(
      /^(?:show|find|search|look for|list)(?: me)?\s+(?:(?:all|more|everything)\s+)?/i,
      "",
    )
    .replace(
      /\b(?:show all|show everything|list all|more options|show more|what else)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const query = /^(?:(?:all|any|some)\s+)?(?:products?|items?|options?)$/i.test(
    cleanedQuery,
  )
    ? undefined
    : cleanedQuery || undefined;
  const requiredTerms = query ? extractRequiredTerms(query) : [];
  if (
    !query &&
    minPrice === undefined &&
    maxPrice === undefined &&
    targetPrice === undefined
  ) {
    return displayMode === "expanded"
      ? { tool: "expand_results", input: {} }
      : null;
  }
  return {
    tool: "search_products",
    input: {
      ...(query ? { query } : {}),
      ...(requiredTerms.length ? { requiredTerms } : {}),
      ...(minPrice !== undefined ? { minPrice } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
      ...(targetPrice !== undefined ? { targetPrice } : {}),
      strict: targetPrice === undefined,
      maxExclusive: Boolean(upperBound),
      displayMode,
      currency: "INR",
      country: "IN",
      limit: 10,
    },
  };
}

async function executeAction(
  commerce: Awaited<ReturnType<typeof createCommerceOrchestrator>>,
  input: { conversationId: string },
  action: ExplicitAction,
): Promise<GenieResponse> {
  switch (action.tool) {
    case "search_products": {
      const discovery = await commerce.discoverProducts(action.input);
      return createRecommendationResponse(
        input.conversationId,
        action.tool,
        discovery,
      );
    }
    case "recommend_products": {
      const discovery = await commerce.discoverProducts(action.input);
      return createRecommendationResponse(
        input.conversationId,
        action.tool,
        discovery,
      );
    }
    case "expand_results": {
      const discovery = commerce.expandProducts();
      return createRecommendationResponse(
        input.conversationId,
        action.tool,
        discovery,
      );
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

export function createRecommendationResponse(
  conversationId: string,
  tool: "search_products" | "recommend_products" | "expand_results",
  discovery: ProductDiscovery,
): GenieResponse {
  const { recommendation, visibleProducts } = discovery;
  const message = recommendation.primary
    ? recommendation.displayMode === "expanded"
      ? `Here are ${visibleProducts.length} matching products.`
      : "I think this one is worth checking out first 👇"
    : "I couldn't find a matching product in this store.";
  return {
    conversationId,
    tool,
    message,
    recommendation,
    products: visibleProducts,
  };
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

function parsePrice(value: string, thousandsSuffix?: string) {
  const amount = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(amount)) return undefined;
  return amount * (thousandsSuffix ? 1000 : 1);
}

function extractRequiredTerms(query: string) {
  const ignored = new Set([
    "a",
    "all",
    "an",
    "any",
    "color",
    "colored",
    "for",
    "item",
    "items",
    "me",
    "option",
    "options",
    "please",
    "product",
    "products",
    "some",
    "something",
    "the",
  ]);
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 1 && !ignored.has(term)),
    ),
  ].slice(0, 8);
}
