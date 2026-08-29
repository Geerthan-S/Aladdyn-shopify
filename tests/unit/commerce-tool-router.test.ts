import { describe, expect, it } from "vitest";
import { inferDeterministicAction } from "@/lib/commerce/tool-router";

describe("deterministic commerce routing", () => {
  it("turns a generic budget request into a Shopify price-only search", () => {
    expect(inferDeterministicAction("Show me products under ₹2000")).toEqual({
      tool: "search_products",
      input: {
        maxPrice: 2000,
        currency: "INR",
        country: "IN",
        limit: 6,
      },
    });
  });

  it("keeps meaningful search terms while extracting the budget", () => {
    expect(
      inferDeterministicAction("Find red skateboards under 3,000"),
    ).toEqual({
      tool: "search_products",
      input: {
        query: "red skateboards",
        maxPrice: 3000,
        currency: "INR",
        country: "IN",
        limit: 6,
      },
    });
  });

  it("routes cart and checkout commands without AI", () => {
    expect(inferDeterministicAction("Show my cart")).toEqual({
      tool: "view_cart",
      input: {},
    });
    expect(inferDeterministicAction("Checkout")).toEqual({
      tool: "checkout",
      input: {},
    });
  });
});
