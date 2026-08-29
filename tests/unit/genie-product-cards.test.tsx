import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RecommendationCards } from "@/components/genie/genie-chat";
import type { CommerceProduct } from "@commerce-agent/providers/types";

describe("Genie recommendation cards", () => {
  it("renders only the primary and three alternatives with canonical prices", () => {
    const products = [
      product("1", "Gift Card", 1500),
      product("2", "Selling Plans Ski Wax", 995),
      product("3", "Gift Card 2", 10000),
      product("4", "Collection Snowboard Liquid", 70095),
    ];
    const markup = renderToStaticMarkup(
      createElement(RecommendationCards, {
        recommendation: {
          primary: products[0],
          alternatives: products.slice(1),
          totalMatches: 10,
          displayMode: "recommended",
        },
        rememberPurchase: vi.fn(),
        send: vi.fn(),
      }),
    );

    expect(markup).toContain("Gift Card");
    expect(markup).toContain("₹15.00");
    expect(markup).toContain("₹9.95");
    expect(markup).not.toContain("₹1,500");
    expect(markup).not.toContain("₹995");
    expect(markup.match(/<article/g)).toHaveLength(4);
    expect(markup).toContain("You can also have a look at these:");
  });
});

function product(
  id: string,
  title: string,
  amountMinor: number,
): CommerceProduct {
  return {
    provider: "shopify",
    merchant: "test.myshopify.com",
    productId: `gid://shopify/Product/${id}`,
    title,
    description: "",
    handle: null,
    url: null,
    vendor: null,
    productType: null,
    images: [],
    variants: [
      {
        variantId: `gid://shopify/ProductVariant/${id}`,
        title: "Default Title",
        sku: null,
        price: { amountMinor, currency: "INR" },
        available: true,
        options: [],
        image: null,
      },
    ],
    price: { amountMinor, currency: "INR" },
    availability: "available",
    metadata: {},
  };
}
