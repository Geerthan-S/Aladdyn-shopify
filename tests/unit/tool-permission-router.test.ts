import { describe, expect, it } from "vitest";
import { assertToolPermission } from "@/lib/tools/router";
import type { ConnectionRecord } from "@/lib/shopify/connection";

const connection = {
  id: "connection-1",
  user_id: "user-1",
  shop_domain: "test.myshopify.com",
  shopify_shop_id: "gid://shopify/Shop/1",
  shop_name: "Test",
  status: "connected",
  api_version: "2026-07",
  granted_scopes: ["read_products"],
  installed_at: "2026-08-27T00:00:00.000Z",
  verified_at: "2026-08-27T00:00:00.000Z",
  disconnected_at: null,
} satisfies ConnectionRecord;

describe("commerce tool permissions", () => {
  it("allows an owner to use an allowlisted tool", () => {
    expect(() =>
      assertToolPermission("user-1", connection, {
        tool: "search_products",
        input: { query: "black shirt" },
      }),
    ).not.toThrow();
  });

  it("rejects a different user and a disconnected store", () => {
    expect(() =>
      assertToolPermission("user-2", connection, {
        tool: "view_cart",
        input: {},
      }),
    ).toThrow(/cannot execute tools/i);
    expect(() =>
      assertToolPermission(
        "user-1",
        { ...connection, status: "disconnected" },
        {
          tool: "view_cart",
          input: {},
        },
      ),
    ).toThrow(/cannot execute tools/i);
  });
});
