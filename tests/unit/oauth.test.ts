import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://aladdyn.example";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.SHOPIFY_API_KEY = "client-id";
  process.env.SHOPIFY_API_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString(
    "base64",
  );
});

describe("OAuth helpers", () => {
  it("builds the allowlisted standalone authorization URL", async () => {
    const { buildAuthorizationUrl } = await import("@/lib/shopify/oauth");
    const url = buildAuthorizationUrl("test", "random-state");
    expect(url.origin).toBe("https://test.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://aladdyn.example/api/shopify/callback",
    );
    expect(url.searchParams.get("grant_options[]")).toBeNull();
  });

  it("generates random state and stores a deterministic hash", async () => {
    const { generateOAuthState, hashOAuthState } =
      await import("@/lib/shopify/oauth");
    const first = generateOAuthState();
    const second = generateOAuthState();
    expect(first).not.toBe(second);
    expect(hashOAuthState(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOAuthState(first)).toBe(hashOAuthState(first));
  });
});
