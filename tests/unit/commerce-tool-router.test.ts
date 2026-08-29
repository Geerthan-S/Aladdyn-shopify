import { describe, expect, it } from "vitest";
import { inferDeterministicAction } from "@/lib/commerce/tool-router";

describe("deterministic commerce routing", () => {
  it.each([
    "products under 2k",
    "products under ₹2k",
    "products below 2000",
    "products less than 2,000",
  ])("parses %s as a strict INR 2000 ceiling", (message) => {
    expect(inferDeterministicAction(message)).toEqual({
      tool: "search_products",
      input: {
        maxPrice: 2000,
        strict: true,
        maxExclusive: true,
        displayMode: "recommended",
        currency: "INR",
        country: "IN",
        limit: 10,
      },
    });
  });

  it("treats around 2k as a soft target", () => {
    expect(inferDeterministicAction("products around 2k")).toEqual({
      tool: "search_products",
      input: {
        targetPrice: 2000,
        strict: false,
        maxExclusive: false,
        displayMode: "recommended",
        currency: "INR",
        country: "IN",
        limit: 10,
      },
    });
  });

  it("parses an inclusive price range", () => {
    expect(inferDeterministicAction("products between 500 and 1000")).toEqual({
      tool: "search_products",
      input: {
        minPrice: 500,
        maxPrice: 1000,
        strict: true,
        maxExclusive: false,
        displayMode: "recommended",
        currency: "INR",
        country: "IN",
        limit: 10,
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
        requiredTerms: ["red", "skateboards"],
        maxPrice: 3000,
        strict: true,
        maxExclusive: true,
        displayMode: "recommended",
        currency: "INR",
        country: "IN",
        limit: 10,
      },
    });
  });

  it("only expands when the shopper explicitly asks", () => {
    expect(
      inferDeterministicAction("show all products under 2k"),
    ).toMatchObject({
      tool: "search_products",
      input: { displayMode: "expanded", maxPrice: 2000 },
    });
    expect(inferDeterministicAction("show more")).toEqual({
      tool: "expand_results",
      input: {},
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

  it.each([
    [
      "add the multi-location snowboard in the cart",
      "multi-location snowboard",
    ],
    ["add the collection snowboard too", "collection snowboard"],
    ["put Multi-managed Snowboard to my cart", "Multi-managed Snowboard"],
  ])(
    "resolves named add request %s without AI IDs",
    (message, productQuery) => {
      expect(inferDeterministicAction(message)).toEqual({
        tool: "add_product_to_cart",
        input: { productQuery, quantity: 1 },
      });
    },
  );

  it("keeps best-match follow-ups in the current product context", () => {
    expect(inferDeterministicAction("which one will be the best")).toEqual({
      tool: "recommend_previous",
      input: {},
    });
  });
});
