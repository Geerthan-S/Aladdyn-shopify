import { describe, expect, it } from "vitest";
import { normalizeShopDomain } from "@/lib/shopify/domain";

describe("normalizeShopDomain", () => {
  it.each([
    ["mystore", "mystore.myshopify.com"],
    ["My-Store.myshopify.com", "my-store.myshopify.com"],
    ["https://mystore.myshopify.com/", "mystore.myshopify.com"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeShopDomain(input)).toBe(expected);
  });

  it.each([
    "https://example.com",
    "mystore.myshopify.com.attacker.example",
    "https://mystore.myshopify.com/admin",
    "https://mystore.myshopify.com/?next=evil",
    "https://user:pass@mystore.myshopify.com",
    "https://mystore.myshopify.com:8443",
    "mystore.myshopify.com@attacker.example",
    "-store",
    "store-",
    "store..myshopify.com",
  ])("rejects %s", (input) => {
    expect(() => normalizeShopDomain(input)).toThrow();
  });
});
