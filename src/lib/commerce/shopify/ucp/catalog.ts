import "server-only";

import { CommerceError } from "@/lib/commerce/errors";
import {
  searchProductsSchema,
  shopifyProductIdSchema,
} from "@/lib/commerce/schemas";
import { ShopifyMcpClient } from "@/lib/commerce/shopify/ucp/mcp-client";
import {
  normalizeProduct,
  normalizeProductList,
} from "@/lib/commerce/shopify/ucp/normalizers";

export async function searchShopifyCatalog(
  client: ShopifyMcpClient,
  merchant: string,
  input: unknown,
) {
  const parsed = searchProductsSchema.parse(input);
  const result = await client.call<unknown>("search_catalog", {
    catalog: {
      query: parsed.query,
      context: {
        ...(parsed.currency ? { currency: parsed.currency } : {}),
        ...(parsed.country ? { address_country: parsed.country } : {}),
      },
      filters: {
        available: true,
        ...(parsed.maxPrice !== undefined
          ? {
              price: {
                max: toMinorUnits(parsed.maxPrice, parsed.currency ?? "USD"),
              },
            }
          : {}),
      },
      pagination: { limit: parsed.limit },
    },
  });
  return normalizeProductList(result, merchant);
}

function toMinorUnits(amount: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(amount * 10 ** digits);
}

export async function lookupShopifyCatalog(
  client: ShopifyMcpClient,
  merchant: string,
  ids: string[],
) {
  const validated = ids.map((id) => shopifyProductIdSchema.parse(id));
  const result = await client.call<unknown>("lookup_catalog", {
    catalog: { ids: validated },
  });
  return normalizeProductList(result, merchant);
}

export async function getShopifyProduct(
  client: ShopifyMcpClient,
  merchant: string,
  productId: string,
) {
  const id = shopifyProductIdSchema.parse(productId);
  const result = await client.call<unknown>("get_product", {
    catalog: { id },
  });
  const product =
    normalizeProduct((result as { product?: unknown }).product, merchant) ??
    normalizeProductList(result, merchant)[0];
  if (!product) {
    throw new CommerceError(
      "INVALID_COMMERCE_INPUT",
      "I couldn't find that product in the store.",
      404,
    );
  }
  return product;
}
