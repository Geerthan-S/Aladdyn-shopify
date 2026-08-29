import "server-only";

import { canonicalMoney } from "@commerce-agent/money";
import type {
  CommerceProduct,
  GenieResponse,
} from "@commerce-agent/providers/types";

export function serializeGenieToolResultForAi(result: GenieResponse) {
  return {
    tool: result.tool,
    message: result.message,
    ...(result.recommendation
      ? {
          recommendation: {
            primary: result.recommendation.primary
              ? aiProduct(result.recommendation.primary)
              : null,
            alternatives: result.recommendation.alternatives.map(aiProduct),
            totalMatches: result.recommendation.totalMatches,
            displayMode: result.recommendation.displayMode,
          },
        }
      : result.products
        ? { products: result.products.map(aiProduct) }
        : {}),
    ...(result.cart
      ? {
          cart: {
            lines: result.cart.lines.map((line) => ({
              variantId: line.variantId,
              title: line.title,
              quantity: line.quantity,
              price: line.price ? canonicalMoney(line.price) : null,
            })),
            totals: result.cart.totals.map((total) => ({
              type: total.type,
              label: total.label,
              money: canonicalMoney(total.money),
            })),
            currency: result.cart.currency,
          },
        }
      : {}),
    ...(result.checkout
      ? {
          checkout: {
            status: result.checkout.status,
            totals: result.checkout.totals.map((total) => ({
              type: total.type,
              label: total.label,
              money: canonicalMoney(total.money),
            })),
            secureHandoffAvailable: Boolean(result.checkout.continueUrl),
          },
        }
      : {}),
  };
}

export function authoritativeCommerceMessage(
  aiContent: string,
  lastToolResult: GenieResponse | null,
) {
  if (lastToolResult?.recommendation) return lastToolResult.message;
  return (
    aiContent ||
    lastToolResult?.message ||
    "I couldn't complete that shopping request."
  );
}

function aiProduct(product: CommerceProduct) {
  return {
    productId: product.productId,
    title: product.title,
    description: product.description,
    vendor: product.vendor,
    productType: product.productType,
    price: canonicalMoney(product.price),
    availability: product.availability,
    variants: product.variants.map((variant) => ({
      variantId: variant.variantId,
      title: variant.title,
      price: canonicalMoney(variant.price),
      available: variant.available,
      options: variant.options,
    })),
  };
}
