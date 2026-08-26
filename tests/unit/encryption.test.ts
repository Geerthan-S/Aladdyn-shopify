import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.SHOPIFY_API_KEY = "api-key";
  process.env.SHOPIFY_API_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
});

describe("AES-256-GCM token encryption", () => {
  it("round-trips access and refresh tokens with a fresh IV", async () => {
    const { decryptTokenBundle, encryptTokenBundle } =
      await import("@/lib/shopify/encryption");
    const bundle = {
      accessToken: "shpat_access",
      refreshToken: "shprt_refresh",
    };
    const first = encryptTokenBundle(bundle);
    const second = encryptTokenBundle(bundle);
    expect(first.iv).not.toBe(second.iv);
    expect(decryptTokenBundle(first)).toEqual(bundle);
  });

  it("rejects tampered ciphertext", async () => {
    const { decryptTokenBundle, encryptTokenBundle } =
      await import("@/lib/shopify/encryption");
    const encrypted = encryptTokenBundle({
      accessToken: "shpat_access",
      refreshToken: "shprt_refresh",
    });
    encrypted.ciphertext = `${encrypted.ciphertext.slice(0, -2)}AA`;
    expect(() => decryptTokenBundle(encrypted)).toThrow();
  });
});
