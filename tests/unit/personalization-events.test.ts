import { describe, expect, it } from "vitest";
import {
  buildPreferenceProfile,
  type ShoppingEvent,
} from "@/lib/personalization/events";

function event(
  eventType: ShoppingEvent["eventType"],
  metadata: Record<string, unknown>,
): ShoppingEvent {
  return {
    id: crypto.randomUUID(),
    eventType,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

describe("shopping behaviour personalization", () => {
  it("weights purchases and cart events above passive views", () => {
    const profile = buildPreferenceProfile([
      event("PRODUCT_VIEW", { category: "formal", color: "white", price: 900 }),
      event("ADD_CART", { category: "sports", color: "black", price: 1800 }),
      event("PURCHASE", {
        category: "sports",
        color: "black",
        price: 2000,
        productTitle: "Running shoes",
      }),
    ]);

    expect(profile.preferredCategories[0]).toBe("sports");
    expect(profile.preferredColors[0]).toBe("black");
    expect(profile.previousPurchases).toEqual(["running shoes"]);
    expect(profile.budget).toEqual({ min: 900, max: 2000, median: 1800 });
  });

  it("removes negatively scored preferences and remembers disliked products", () => {
    const profile = buildPreferenceProfile([
      event("PRODUCT_VIEW", { category: "sandals", productId: "p1" }),
      event("PRODUCT_DISLIKE", { category: "sandals", productId: "p1" }),
    ]);

    expect(profile.preferredCategories).not.toContain("sandals");
    expect(profile.dislikedProductIds).toEqual(["p1"]);
  });
});
