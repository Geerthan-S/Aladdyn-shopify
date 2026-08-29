import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertShopAvailable } from "@/lib/shopify/connection";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  }),
}));

describe("Shopify store ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows a disconnected store record to be claimed by another tester", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: "old-user", status: "disconnected" },
      error: null,
    });

    await expect(
      assertShopAvailable("miporis-lite-testing.myshopify.com", "new-user"),
    ).resolves.toBeUndefined();
  });

  it("blocks an actively connected store owned by another account", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { user_id: "old-user", status: "connected" },
      error: null,
    });

    await expect(
      assertShopAvailable("miporis-lite-testing.myshopify.com", "new-user"),
    ).rejects.toMatchObject({ code: "OWNERSHIP_CONFLICT" });
  });
});
