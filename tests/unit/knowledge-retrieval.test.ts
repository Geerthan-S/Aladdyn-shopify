import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  rpc: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/lib/knowledge/embedding-provider", () => ({
  isEmbeddingConfigured: () => true,
  getEmbeddingProvider: async () => ({
    model: "configured-embedding-model",
    dimensions: 1536,
    embed: mocks.embed,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

describe("store-filtered vector retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.embed.mockResolvedValue([Array(1536).fill(0.1)]);
    mocks.createAdminSupabase.mockReturnValue({ rpc: mocks.rpc });
  });

  it("retrieves compact product candidates within the selected store", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          product_id: "row-1",
          shopify_product_id: "gid://shopify/Product/1",
          name: "Black Shirt",
          category: "shirts",
          description: "Cotton",
          colors: ["black"],
          sizes: ["M"],
          price_min: 1500,
          price_max: 1800,
          currency_code: "INR",
          availability: "available",
          images: [{ url: "https://cdn.example/product.jpg" }],
          similarity: 0.92,
        },
      ],
      error: null,
    });
    const { retrieveProducts } = await import("@/lib/knowledge/products");
    const products = await retrieveProducts("store-1", "black shirt", 4);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "match_product_embeddings",
      expect.objectContaining({ p_store_id: "store-1", p_match_count: 4 }),
    );
    expect(products[0]).toMatchObject({
      name: "Black Shirt",
      imageUrl: "https://cdn.example/product.jpg",
      similarity: 0.92,
    });
  });

  it("retrieves merchant policy without exposing another store", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "knowledge-1",
          type: "RETURNS",
          content: "Seven day returns",
          metadata: {},
          similarity: 0.9,
        },
      ],
      error: null,
    });
    const { retrieveKnowledge } = await import("@/lib/knowledge");
    const knowledge = await retrieveKnowledge("store-2", "return policy", 3);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "match_merchant_knowledge",
      expect.objectContaining({ p_store_id: "store-2", p_match_count: 3 }),
    );
    expect(knowledge[0].content).toBe("Seven day returns");
  });
});
