import { describe, expect, it } from "vitest";
import {
  canonicalizeOAuthParams,
  signOAuthParams,
  signWebhookBody,
  verifyOAuthHmac,
  verifyWebhookHmac,
} from "@/lib/shopify/hmac";

describe("Shopify HMAC verification", () => {
  it("canonicalizes callback values and excludes hmac/signature", () => {
    const params = new URLSearchParams(
      "shop=test.myshopify.com&timestamp=1700000000&code=a%20b&hmac=ignored&signature=old",
    );
    expect(canonicalizeOAuthParams(params)).toBe(
      "code=a b&shop=test.myshopify.com&timestamp=1700000000",
    );
  });

  it("accepts a valid callback and rejects tampering", () => {
    const params = new URLSearchParams(
      "shop=test.myshopify.com&state=nonce&timestamp=1700000000&code=abc",
    );
    params.set("hmac", signOAuthParams(params, "test-secret"));
    expect(verifyOAuthHmac(params, "test-secret")).toBe(true);
    params.set("code", "tampered");
    expect(verifyOAuthHmac(params, "test-secret")).toBe(false);
    params.set("hmac", "not-hex");
    expect(verifyOAuthHmac(params, "test-secret")).toBe(false);
  });

  it("verifies the unmodified webhook body", () => {
    const body = Buffer.from(
      '{"shop_id":123,"shop_domain":"test.myshopify.com"}',
    );
    const signature = signWebhookBody(body, "test-secret");
    expect(verifyWebhookHmac(body, signature, "test-secret")).toBe(true);
    expect(
      verifyWebhookHmac(
        Buffer.from(`${body.toString()} `),
        signature,
        "test-secret",
      ),
    ).toBe(false);
  });
});
