import { describe, expect, it } from "vitest";
import { normalizeProduct } from "@/lib/shopify/products";

describe("Shopify product normalization", () => {
  it("builds compact AI-safe product fields from products and variants", () => {
    const product = normalizeProduct(
      {
        id: "gid://shopify/Product/1",
        title: "Runner",
        handle: "runner",
        description: "Light running shoe",
        vendor: "Example",
        productType: "Shoes",
        tags: ["sport"],
        updatedAt: "2026-08-27T00:00:00Z",
        totalInventory: 4,
        images: {
          nodes: [{ url: "https://cdn.example/a.jpg", altText: null }],
        },
        collections: {
          nodes: [
            {
              id: "gid://shopify/Collection/1",
              title: "Running",
              handle: "running",
            },
          ],
        },
        variants: {
          nodes: [
            {
              id: "gid://shopify/ProductVariant/1",
              title: "Black / 9",
              sku: "RUN-9",
              price: "4999.00",
              inventoryQuantity: 4,
              availableForSale: true,
              selectedOptions: [
                { name: "Color", value: "Black" },
                { name: "Size", value: "9" },
              ],
              image: null,
            },
          ],
        },
      },
      "INR",
    );
    expect(product).toMatchObject({
      name: "Runner",
      category: "Shoes",
      colors: ["Black"],
      sizes: ["9"],
      price_min: 4999,
      availability: "available",
    });
  });
});
