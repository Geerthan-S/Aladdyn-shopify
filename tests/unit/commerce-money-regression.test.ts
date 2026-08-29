import { describe, expect, it } from "vitest";
import { buildProductDiscovery } from "@commerce-agent/recommendation/discovery";
import { productCardView } from "@commerce-agent/presentation/product-card";
import type { GenieResponse } from "@commerce-agent/providers/types";
import { normalizeProductList } from "@shopify-adapter/ucp/normalizers";
import {
  authoritativeCommerceMessage,
  serializeGenieToolResultForAi,
} from "@/lib/ai/tool-payload";
import { canonicalMoney } from "@commerce-agent/money";

describe("commerce money and recommendation regression", () => {
  it("rejects ambiguous non-integer minor-unit money", () => {
    expect(() =>
      canonicalMoney({ amountMinor: 15.5, currency: "INR" }),
    ).toThrow(/amountMinor/);
  });

  it("preserves ₹15.00 and ₹9.95 from Shopify through AI and card views", () => {
    const normalized = normalizeProductList(
      {
        products: [
          rawProduct("1", "Gift Card", 1500),
          rawProduct("2", "Selling Plans Ski Wax", 995),
          rawProduct("3", "Gift Card 2", 10000),
          rawProduct("4", "Collection Snowboard Liquid", 70095),
          rawProduct("5", "Multi-managed Snowboard", 62995),
          rawProduct("6", "Over-budget Product", 250000),
        ],
      },
      "test.myshopify.com",
    );

    expect(normalized[0].price).toEqual({
      amountMinor: 1500,
      currency: "INR",
    });
    expect(normalized[1].price).toEqual({
      amountMinor: 995,
      currency: "INR",
    });

    const discovery = buildProductDiscovery(normalized, {
      maxPrice: 2000,
      maxExclusive: true,
      strict: true,
      currency: "INR",
      displayMode: "recommended",
    });
    expect(discovery.candidateProducts).toHaveLength(6);
    expect(discovery.matchingProducts).toHaveLength(5);
    expect(discovery.visibleProducts).toHaveLength(4);
    expect(
      discovery.matchingProducts.some(
        (product) => product.title === "Over-budget Product",
      ),
    ).toBe(false);

    const response: GenieResponse = {
      conversationId: "conversation-1",
      tool: "search_products",
      message: "I think this one is worth checking out first 👇",
      recommendation: discovery.recommendation,
      products: discovery.visibleProducts,
    };
    const aiPayload = serializeGenieToolResultForAi(response);
    const serialized = JSON.stringify(aiPayload);
    expect(serialized).toContain('"amount":"15.00"');
    expect(serialized).toContain('"amount":"9.95"');
    expect(serialized).toContain('"currencyCode":"INR"');
    expect(serialized).not.toContain("amountMinor");
    expect(serialized).not.toContain('"amount":1500');
    expect(serialized).not.toContain('"amount":995');
    expect(serialized).not.toContain("USD");

    expect(productCardView(normalized[0]).price).toMatchObject({
      amount: "15.00",
      currencyCode: "INR",
      display: "₹15.00",
    });
    expect(productCardView(normalized[1]).price).toMatchObject({
      amount: "9.95",
      currencyCode: "INR",
      display: "₹9.95",
    });
    expect(response.products).toHaveLength(4);
    expect(response.products).toEqual(discovery.visibleProducts);
    expect(
      authoritativeCommerceMessage("Gift Card - ₹1500 INR ($18 USD)", response),
    ).toBe("I think this one is worth checking out first 👇");
  });

  it("returns every matching candidate only in explicit expanded mode", () => {
    const products = normalizeProductList(
      {
        products: Array.from({ length: 7 }, (_, index) =>
          rawProduct(String(index + 1), `Product ${index + 1}`, 1000 + index),
        ),
      },
      "test.myshopify.com",
    );
    const recommended = buildProductDiscovery(products, {
      maxPrice: 2000,
      strict: true,
      currency: "INR",
      displayMode: "recommended",
    });
    const expanded = buildProductDiscovery(products, {
      maxPrice: 2000,
      strict: true,
      currency: "INR",
      displayMode: "expanded",
    });
    expect(recommended.visibleProducts).toHaveLength(4);
    expect(recommended.recommendation.alternatives).toHaveLength(3);
    expect(expanded.visibleProducts).toHaveLength(7);
  });

  it("enforces explicit color and category terms before visibility", () => {
    const products = normalizeProductList(
      {
        products: [
          rawProduct("1", "Red Skateboard", 10000),
          rawProduct("2", "Blue Skateboard", 10000),
          rawProduct("3", "Red Snowboard", 10000),
        ],
      },
      "test.myshopify.com",
    );
    const discovery = buildProductDiscovery(products, {
      query: "red skateboards",
      requiredTerms: ["red", "skateboards"],
      strict: true,
      displayMode: "recommended",
    });
    expect(discovery.visibleProducts.map((product) => product.title)).toEqual([
      "Red Skateboard",
    ]);
  });
});

function rawProduct(id: string, title: string, amount: number) {
  return {
    id: `gid://shopify/Product/${id}`,
    title,
    price_range: { min: { amount, currency: "INR" } },
    variants: [
      {
        id: `gid://shopify/ProductVariant/${id}`,
        title: "Default Title",
        price: { amount, currency: "INR" },
        availability: { available: true },
        options: [],
        media: [],
      },
    ],
    media: [],
  };
}
