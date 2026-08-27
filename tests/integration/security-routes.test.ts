import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/shopify/errors";
import { signOAuthParams } from "@/lib/shopify/hmac";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  createAdminSupabase: vi.fn(),
  getConnectionForUser: vi.fn(),
  shopifyGraphQL: vi.fn(),
  shopifyGraphQLWithAccessToken: vi.fn(),
  uninstallShopifyApp: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("@/lib/shopify/connection", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/shopify/connection")>();
  return {
    ...original,
    assertShopAvailable: vi.fn(),
    getConnectionForUser: mocks.getConnectionForUser,
  };
});
vi.mock("@/lib/shopify/admin-graphql", () => ({
  shopifyGraphQL: mocks.shopifyGraphQL,
  shopifyGraphQLWithAccessToken: mocks.shopifyGraphQLWithAccessToken,
  uninstallShopifyApp: mocks.uninstallShopifyApp,
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://aladdyn.example";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.SHOPIFY_API_KEY = "client-id";
  process.env.SHOPIFY_API_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString(
    "base64",
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SHOPIFY_APP_STORE_URL;
  delete process.env.SHOPIFY_TEST_STORE_DOMAIN;
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.uninstallShopifyApp.mockResolvedValue(undefined);
  mocks.shopifyGraphQL.mockResolvedValue({
    data: {
      appUninstall: { app: { id: "gid://shopify/App/1" }, userErrors: [] },
    },
    graphQL: {
      requestedCost: 1,
      actualCost: 1,
      currentlyAvailable: 999,
      restoreRate: 50,
    },
  });
  mocks.createAdminSupabase.mockReturnValue({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  });
});

describe("security-sensitive route boundaries", () => {
  it("redirects an unauthenticated App Store attempt without contacting Shopify", async () => {
    mocks.requireUser.mockRejectedValueOnce(
      new AppError("AUTH_REQUIRED", "Log in to continue", 401),
    );
    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request("https://aladdyn.example/api/shopify/install"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aladdyn.example/connect?error=AUTH_REQUIRED",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("sends an authenticated merchant to the configured App Store listing", async () => {
    process.env.SHOPIFY_APP_STORE_URL =
      "https://apps.shopify.com/aladdyn-test-listing";
    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request("https://aladdyn.example/api/shopify/install"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://apps.shopify.com/aladdyn-test-listing",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("starts OAuth for the configured development store while the app is a draft", async () => {
    process.env.SHOPIFY_TEST_STORE_DOMAIN = "Draft-Store.myshopify.com";
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createAdminSupabase.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });

    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request("https://aladdyn.example/api/shopify/install"),
    );

    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(location.origin).toBe("https://draft-store.myshopify.com");
    expect(location.pathname).toBe("/admin/oauth/authorize");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        shop_domain: "draft-store.myshopify.com",
        state_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        redirect_path: "/dashboard?connected=1",
      }),
    );
  });

  it("prefers the App Store listing after the app is published", async () => {
    process.env.SHOPIFY_APP_STORE_URL =
      "https://apps.shopify.com/aladdyn-test-listing";
    process.env.SHOPIFY_TEST_STORE_DOMAIN = "draft-store.myshopify.com";

    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request("https://aladdyn.example/api/shopify/install"),
    );

    expect(response.headers.get("location")).toBe(
      "https://apps.shopify.com/aladdyn-test-listing",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("creates a server-side state record for a signed Shopify launch", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createAdminSupabase.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    const params = new URLSearchParams({
      shop: "test.myshopify.com",
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    params.set(
      "hmac",
      signOAuthParams(params, "0123456789abcdef0123456789abcdef"),
    );
    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request(
        `https://aladdyn.example/api/shopify/install?${params.toString()}`,
      ),
    );
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(location.origin).toBe("https://test.myshopify.com");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        shop_domain: "test.myshopify.com",
        state_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        redirect_path: "/dashboard?connected=1",
      }),
    );
  });

  it("rejects an unsigned Shopify launch before creating OAuth state", async () => {
    const { GET } = await import("@/app/api/shopify/install/route");
    const response = await GET(
      new Request(
        "https://aladdyn.example/api/shopify/install?shop=test.myshopify.com&timestamp=1700000000",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aladdyn.example/connect?error=OAUTH_INVALID",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("rejects a forged OAuth callback before token exchange", async () => {
    const { GET } = await import("@/app/api/shopify/callback/route");
    const response = await GET(
      new Request(
        "https://aladdyn.example/api/shopify/callback?shop=test.myshopify.com&timestamp=1700000000&code=abc&state=nonce&hmac=bad",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aladdyn.example/connect?error=OAUTH_INVALID",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("uninstalls the Shopify app before deleting local credentials", async () => {
    const connection = {
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
    };
    mocks.getConnectionForUser.mockResolvedValue(connection);
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const updateOwnerEq = vi.fn().mockResolvedValue({ error: null });
    const updateIdEq = vi.fn(() => ({ eq: updateOwnerEq }));
    mocks.createAdminSupabase.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "shopify_connection_secrets") {
          return { delete: vi.fn(() => ({ eq: deleteEq })) };
        }
        return { update: vi.fn(() => ({ eq: updateIdEq })) };
      }),
    });

    const { POST } = await import("@/app/api/shopify/disconnect/route");
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      disconnected: true,
      shopifyRevocation: "uninstalled",
    });
    expect(mocks.uninstallShopifyApp).toHaveBeenCalledWith(connection);
    expect(deleteEq).toHaveBeenCalledWith("connection_id", "connection-1");
    expect(updateIdEq).toHaveBeenCalledWith("id", "connection-1");
    expect(updateOwnerEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("keeps local credentials when Shopify cannot uninstall", async () => {
    mocks.getConnectionForUser.mockResolvedValue({
      id: "connection-1",
      user_id: "user-1",
      shop_domain: "test.myshopify.com",
    });
    mocks.uninstallShopifyApp.mockRejectedValueOnce(
      new AppError("NETWORK_ERROR", "Shopify could not be reached", 503),
    );

    const { POST } = await import("@/app/api/shopify/disconnect/route");
    const response = await POST();

    expect(response.status).toBe(503);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("returns 401 for a forged raw-body webhook", async () => {
    const { POST } = await import("@/app/api/shopify/webhooks/route");
    const response = await POST(
      new Request("https://aladdyn.example/api/shopify/webhooks", {
        method: "POST",
        headers: {
          "x-shopify-hmac-sha256": "invalid",
          "x-shopify-topic": "app/uninstalled",
          "x-shopify-webhook-id": "webhook-1",
          "x-shopify-shop-domain": "test.myshopify.com",
        },
        body: JSON.stringify({ shop_id: 1 }),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("rejects a non-allowlisted dataset before reading a connection", async () => {
    const { GET } = await import("@/app/api/shopify/data/[dataset]/route");
    const response = await GET(
      new NextRequest(
        "https://aladdyn.example/api/shopify/data/arbitrary-graphql",
      ),
      {
        params: Promise.resolve({ dataset: "arbitrary-graphql" }),
      } as never,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_DATASET" },
    });
    expect(mocks.getConnectionForUser).not.toHaveBeenCalled();
  });
});
