import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  retrieveKnowledge: vi.fn(),
  retrieveProducts: vi.fn(),
  getCustomerHistory: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("@/lib/knowledge", () => ({
  retrieveKnowledge: mocks.retrieveKnowledge,
}));
vi.mock("@/lib/knowledge/products", () => ({
  retrieveProducts: mocks.retrieveProducts,
}));
vi.mock("@/lib/personalization/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/personalization/events")>()),
  getCustomerHistory: mocks.getCustomerHistory,
}));

describe("AI context builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieveProducts.mockResolvedValue([
      {
        productId: "product-row-1",
        shopifyProductId: "gid://shopify/Product/1",
        name: "Black Runner",
        category: "sports",
        description: "Lightweight shoe",
        colors: ["black"],
        sizes: ["9"],
        priceMin: 1800,
        priceMax: 1800,
        currency: "INR",
        availability: "available",
        imageUrl: null,
        similarity: 0.91,
      },
    ]);
    mocks.retrieveKnowledge.mockResolvedValue([
      {
        id: "knowledge-1",
        type: "RETURNS",
        content: "Returns are accepted within seven days.",
        metadata: {},
        similarity: 0.88,
      },
    ]);
    mocks.getCustomerHistory.mockResolvedValue([
      {
        id: "event-1",
        eventType: "PURCHASE",
        metadata: {
          category: "sports",
          color: "black",
          price: 2000,
          productTitle: "Running shoes",
        },
        createdAt: "2026-08-27T00:00:00.000Z",
      },
    ]);

    mocks.createAdminSupabase.mockReturnValue({
      from(table: string) {
        if (table === "stores") {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: "11111111-1111-4111-8111-111111111111",
                    name: "Test Store",
                    currency_code: "INR",
                    sync_status: "ready",
                    sync_product_count: 1,
                    last_synced_at: "2026-08-27T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "conversations") {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "conversation-row-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [{ role: "user", content: "I like shoes" }],
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    preferred_categories: [],
                    preferred_colors: [],
                    preferred_sizes: [],
                    budget_min: null,
                    budget_max: null,
                  },
                }),
              }),
            }),
          }),
        };
      },
    });
  });

  it("combines intent, relevant products, merchant rules, and behaviour", async () => {
    const { buildConversationContext } =
      await import("@/lib/ai/context-builder");
    const result = await buildConversationContext({
      connection: {
        id: "connection-1",
        user_id: "user-1",
        shop_domain: "test.myshopify.com",
        shopify_shop_id: "gid://shopify/Shop/1",
        shop_name: "Test Store",
        status: "connected",
        api_version: "2026-07",
        granted_scopes: ["read_products"],
        installed_at: "2026-08-27T00:00:00.000Z",
        verified_at: "2026-08-27T00:00:00.000Z",
        disconnected_at: null,
      },
      conversationId: "session-1",
      message: "Can I return a black running shoe?",
    });

    const context = JSON.parse(result.systemContext);
    expect(context.intent).toBe("merchant_policy");
    expect(context.products[0].name).toBe("Black Runner");
    expect(context.products[0].warning).toMatch(/verify live facts/i);
    expect(context.merchant_rules[0].type).toBe("RETURNS");
    expect(context.customer_profile.behaviour.previousPurchases).toEqual([
      "running shoes",
    ]);
    expect(context.customer_profile.effective.preferredColors).toContain(
      "black",
    );
  });
});
