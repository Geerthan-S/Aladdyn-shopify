import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AppError } from "@/lib/shopify/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  enforceRateLimit: vi.fn(),
  createAdminSupabase: vi.fn(),
  getConnectionForUser: vi.fn(),
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
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.createAdminSupabase.mockReturnValue({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  });
});

describe("security-sensitive route boundaries", () => {
  it("redirects an unauthenticated install attempt without contacting Shopify", async () => {
    mocks.requireUser.mockRejectedValueOnce(
      new AppError("AUTH_REQUIRED", "Log in to continue", 401),
    );
    const { POST } = await import("@/app/api/shopify/install/route");
    const body = new FormData();
    body.set("shop", "test");
    const response = await POST(
      new Request("https://aladdyn.example/api/shopify/install", {
        method: "POST",
        body,
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://aladdyn.example/connect?error=AUTH_REQUIRED",
    );
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("creates a server-side state record before redirecting to Shopify", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createAdminSupabase.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    const { POST } = await import("@/app/api/shopify/install/route");
    const body = new FormData();
    body.set("shop", "https://test.myshopify.com/");
    const response = await POST(
      new Request("https://aladdyn.example/api/shopify/install", {
        method: "POST",
        body,
      }),
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
      }),
    );
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
