import { describe, expect, it } from "vitest";
import { datasetNameSchema, paginationSchema } from "@/lib/shopify/datasets";
import { redactSecrets } from "@/lib/shopify/errors";
import { compareScopes } from "@/lib/shopify/scopes";

describe("scope, dataset, and error safety", () => {
  it("reports missing and extra scopes", () => {
    expect(
      compareScopes(
        ["read_products", "read_orders"],
        ["read_products", "read_discounts"],
      ),
    ).toEqual({
      configured: ["read_orders", "read_products"],
      granted: ["read_discounts", "read_products"],
      missing: ["read_orders"],
      extra: ["read_discounts"],
      needsReauthorization: true,
    });
  });

  it("allowlists datasets and constrains pagination", () => {
    expect(datasetNameSchema.safeParse("products").success).toBe(true);
    expect(datasetNameSchema.safeParse("arbitrary-graphql").success).toBe(
      false,
    );
    expect(
      paginationSchema.safeParse({ limit: 50, after: "Y3Vyc29y" }).success,
    ).toBe(true);
    expect(paginationSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(
      paginationSchema.safeParse({ after: "a", before: "b" }).success,
    ).toBe(false);
    expect(paginationSchema.safeParse({ after: "<script>" }).success).toBe(
      false,
    );
  });

  it("redacts tokens, authorization codes, and sensitive object keys", () => {
    const redacted = redactSecrets({
      accessToken: "shpat_secret123",
      message: "failed?code=abc&state=xyz",
      safe: "visible",
    });
    expect(redacted).toEqual({
      accessToken: "[REDACTED]",
      message: "failed?code=[REDACTED]&state=[REDACTED]",
      safe: "visible",
    });
  });
});
