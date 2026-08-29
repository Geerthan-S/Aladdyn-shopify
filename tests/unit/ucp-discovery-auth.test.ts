import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAgentTokenCache,
  getShopifyAgentToken,
} from "@shopify-adapter/ucp/auth";
import {
  clearDiscoveryCache,
  discoverCommerceCapabilities,
} from "@shopify-adapter/ucp/discovery";

const validProfile = {
  ucp: {
    version: "2026-04-08",
    services: {
      "dev.ucp.shopping": [
        {
          version: "2026-04-08",
          transport: "mcp",
          endpoint: "https://test.myshopify.com/api/ucp/mcp",
        },
      ],
    },
    capabilities: {
      "dev.ucp.shopping.catalog.search": [{ version: "2026-04-08" }],
      "dev.ucp.shopping.catalog.lookup": [{ version: "2026-04-08" }],
      "dev.ucp.shopping.cart": [{ version: "2026-04-08" }],
      "dev.ucp.shopping.checkout": [{ version: "2026-04-08" }],
    },
  },
};

describe("UCP discovery", () => {
  beforeEach(clearDiscoveryCache);

  it("discovers the merchant MCP endpoint and capabilities", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(validProfile, {
        headers: { "cache-control": "max-age=60" },
      }),
    );
    const result = await discoverCommerceCapabilities("test.myshopify.com", {
      fetcher,
    });
    expect(result).toMatchObject({
      version: "2026-04-08",
      catalog: { search: true, lookup: true, product: true },
      cart: { supported: true, semantics: "replace" },
      checkout: { supported: true, mode: "handoff", directCompletion: false },
    });
    expect(result.mcpEndpoint).toBe("https://test.myshopify.com/api/ucp/mcp");
  });

  it("caches successful discovery", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(validProfile));
    await discoverCommerceCapabilities("test.myshopify.com", { fetcher });
    await discoverCommerceCapabilities("test.myshopify.com", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not permanently cache discovery failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 503 }))
      .mockResolvedValueOnce(Response.json(validProfile));
    await expect(
      discoverCommerceCapabilities("test.myshopify.com", { fetcher }),
    ).rejects.toMatchObject({ code: "DISCOVERY_INVALID" });
    await expect(
      discoverCommerceCapabilities("test.myshopify.com", { fetcher }),
    ).resolves.toMatchObject({ provider: "shopify" });
  });

  it("rejects an invalid profile", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ hello: "world" }));
    await expect(
      discoverCommerceCapabilities("test.myshopify.com", { fetcher }),
    ).rejects.toMatchObject({ code: "DISCOVERY_INVALID" });
  });

  it("rejects a cross-origin MCP endpoint", async () => {
    const unsafe = structuredClone(validProfile);
    unsafe.ucp.services["dev.ucp.shopping"][0].endpoint =
      "https://attacker.example/api/ucp/mcp";
    const fetcher = vi.fn().mockResolvedValue(Response.json(unsafe));
    await expect(
      discoverCommerceCapabilities("test.myshopify.com", { fetcher }),
    ).rejects.toMatchObject({ code: "DISCOVERY_INVALID" });
  });

  it("handles an unsupported capability", async () => {
    const limited = structuredClone(validProfile);
    delete (limited.ucp.capabilities as Record<string, unknown>)[
      "dev.ucp.shopping.cart"
    ];
    const fetcher = vi.fn().mockResolvedValue(Response.json(limited));
    const result = await discoverCommerceCapabilities("test.myshopify.com", {
      fetcher,
    });
    expect(result.cart.supported).toBe(false);
  });
});

describe("Shopify UCP agent authentication", () => {
  beforeEach(() => {
    clearAgentTokenCache();
    process.env.SHOPIFY_UCP_CLIENT_ID = "agent-id";
    process.env.SHOPIFY_UCP_CLIENT_SECRET = "agent-secret";
  });

  it("mints a server-side token", async () => {
    const token = jwt(Date.now() + 60 * 60 * 1000);
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: token }));
    await expect(getShopifyAgentToken(fetcher)).resolves.toBe(token);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      grant_type: "client_credentials",
      client_id: "agent-id",
      client_secret: "agent-secret",
    });
  });

  it("caches a token before its refresh window", async () => {
    const token = jwt(Date.now() + 60 * 60 * 1000);
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: token }));
    await getShopifyAgentToken(fetcher);
    await getShopifyAgentToken(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expiring token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: jwt(Date.now() + 1000) }),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: jwt(Date.now() + 60 * 60 * 1000) }),
      );
    await getShopifyAgentToken(fetcher);
    await getShopifyAgentToken(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails safely when credentials are rejected", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 401 }));
    await expect(getShopifyAgentToken(fetcher)).rejects.toMatchObject({
      code: "AGENT_AUTH_FAILED",
    });
  });

  it("requires credentials without exposing which secret is absent", async () => {
    delete process.env.SHOPIFY_UCP_CLIENT_SECRET;
    await expect(getShopifyAgentToken(vi.fn())).rejects.toMatchObject({
      code: "AGENT_AUTH_FAILED",
      message: "Shopify UCP agent credentials are not configured",
    });
  });
});

function jwt(expiresAt: number) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(expiresAt / 1000) }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}
