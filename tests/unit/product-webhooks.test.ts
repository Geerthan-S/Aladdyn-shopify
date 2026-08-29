import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionForShop: vi.fn(),
  fetchProductById: vi.fn(),
  refreshProductEmbeddings: vi.fn(),
  createAdminSupabase: vi.fn(),
  productDelete: vi.fn(),
  productUpsert: vi.fn(),
}));

vi.mock("@/lib/shopify/connection", () => ({
  getConnectionForShop: mocks.getConnectionForShop,
}));
vi.mock("@/lib/shopify/products", () => ({
  fetchProductById: mocks.fetchProductById,
}));
vi.mock("@/lib/knowledge/products", () => ({
  refreshProductEmbeddings: mocks.refreshProductEmbeddings,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

describe("product webhook synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConnectionForShop.mockResolvedValue({
      id: "connection-1",
      status: "connected",
    });
    mocks.refreshProductEmbeddings.mockResolvedValue({
      status: "ready",
      updated: 1,
    });
    mocks.productDelete.mockResolvedValue({ error: null });
    mocks.productUpsert.mockResolvedValue({ error: null });
    mocks.createAdminSupabase.mockReturnValue({
      from(table: string) {
        if (table === "stores") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "store-1" },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {
          delete: () => ({
            eq: () => ({ eq: mocks.productDelete }),
          }),
          upsert: mocks.productUpsert,
          select: () => ({
            eq: async () => ({ count: 1, error: null }),
          }),
        };
      },
    });
  });

  it("deletes a normalized product and relies on embedding cascade", async () => {
    const { processProductWebhook } =
      await import("@/lib/shopify/product-webhooks");
    const result = await processProductWebhook(
      "products/delete",
      "test.myshopify.com",
      { id: 123 },
    );

    expect(mocks.productDelete).toHaveBeenCalledWith(
      "shopify_product_id",
      "gid://shopify/Product/123",
    );
    expect(mocks.refreshProductEmbeddings).not.toHaveBeenCalled();
    expect(result.status).toBe("deleted");
  });

  it("refetches and embeds an authoritative product on update", async () => {
    const product = {
      shopify_product_id: "gid://shopify/Product/123",
      name: "Black Shirt",
    };
    mocks.fetchProductById.mockResolvedValue(product);
    const { processProductWebhook } =
      await import("@/lib/shopify/product-webhooks");
    const result = await processProductWebhook(
      "products/update",
      "test.myshopify.com",
      { id: "123" },
    );

    expect(mocks.fetchProductById).toHaveBeenCalledWith(
      expect.objectContaining({ id: "connection-1" }),
      "gid://shopify/Product/123",
    );
    expect(mocks.productUpsert).toHaveBeenCalledWith(
      { ...product, store_id: "store-1" },
      { onConflict: "store_id,shopify_product_id" },
    );
    expect(mocks.refreshProductEmbeddings).toHaveBeenCalledWith({
      storeId: "store-1",
      shopifyProductIds: ["gid://shopify/Product/123"],
    });
    expect(result.status).toBe("updated");
  });

  it("keeps the synchronized product when optional embedding fails", async () => {
    mocks.fetchProductById.mockResolvedValue({
      shopify_product_id: "gid://shopify/Product/123",
      name: "Black Shirt",
    });
    mocks.refreshProductEmbeddings.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    const { processProductWebhook } =
      await import("@/lib/shopify/product-webhooks");
    const result = await processProductWebhook(
      "products/update",
      "test.myshopify.com",
      { id: 123 },
    );

    expect(mocks.productUpsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "updated",
      embeddings: { status: "failed", updated: 0 },
    });
  });
});
