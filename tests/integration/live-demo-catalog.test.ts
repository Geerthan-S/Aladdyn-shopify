import { expect, it } from "vitest";
import { createShopifyCommerceProvider } from "@shopify-adapter";
import { buildProductDiscovery } from "@commerce-agent/recommendation/discovery";
import { createRecommendationResponse } from "@/lib/commerce/tool-router";
import { serializeGenieToolResultForAi } from "@/lib/ai/tool-payload";
import { productCardView } from "@commerce-agent/presentation/product-card";

const live = process.env.RUN_LIVE_DEMO_CATALOG === "1" ? it : it.skip;

live(
  "keeps the demo store's live INR prices consistent in AI and cards",
  async () => {
    process.env.ALADDYN_UCP_PROFILE_URL =
      "https://aladdyn-app.vercel.app/.well-known/ucp";
    const provider = await createShopifyCommerceProvider(
      "miporis-lite-testing.myshopify.com",
    );
    const candidates = await provider.searchProducts({
      maxPrice: 2000,
      currency: "INR",
      country: "IN",
      strict: true,
      maxExclusive: true,
      displayMode: "recommended",
      limit: 10,
    });
    const discovery = buildProductDiscovery(candidates, {
      maxPrice: 2000,
      currency: "INR",
      strict: true,
      maxExclusive: true,
      displayMode: "recommended",
    });
    const response = createRecommendationResponse(
      "live-demo",
      "search_products",
      discovery,
    );
    const aiPayload = JSON.stringify(serializeGenieToolResultForAi(response));
    const cards = response.products?.map(productCardView) ?? [];
    console.info("live.demo.recommendation", {
      message: response.message,
      displayMode: response.recommendation?.displayMode,
      totalMatches: response.recommendation?.totalMatches,
      cards: cards.map((card) => ({
        title: card.title,
        price: card.price.display,
      })),
    });

    expect(response.products?.length).toBeGreaterThan(0);
    expect(response.products?.length).toBeLessThanOrEqual(4);
    expect(response.recommendation?.alternatives.length).toBeLessThanOrEqual(3);
    expect(
      response.products?.every((product) => product.price.amountMinor < 200000),
    ).toBe(true);
    expect(aiPayload).not.toContain("amountMinor");
    expect(aiPayload).not.toContain("USD");
    for (const card of cards) {
      expect(aiPayload).toContain(`\"amount\":\"${card.price.amount}\"`);
      expect(aiPayload).toContain(`\"currencyCode\":\"INR\"`);
    }
  },
);
