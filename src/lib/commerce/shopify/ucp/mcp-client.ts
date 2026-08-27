import "server-only";

import { CommerceError } from "@/lib/commerce/errors";
import { jsonRpcEnvelopeSchema } from "@/lib/commerce/schemas";
import { getAgentProfileUrl } from "@/lib/commerce/shopify/ucp/agent-profile";
import { getShopifyAgentToken } from "@/lib/commerce/shopify/ucp/auth";
import {
  retryDelay,
  waitForRetry,
} from "@/lib/commerce/shopify/ucp/rate-limit";

const SAFE_RETRY_TOOLS = new Set([
  "tools/list",
  "search_catalog",
  "lookup_catalog",
  "get_product",
  "get_cart",
  "get_checkout",
]);

type McpClientOptions = {
  endpoint: string;
  shopDomain: string;
  authenticated?: boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class ShopifyMcpClient {
  constructor(private readonly options: McpClientOptions) {}

  async listTools() {
    const result = await this.request("tools/list", {}, "tools/list", false);
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async call<T>(
    tool: string,
    args: Record<string, unknown>,
    options: { idempotencyKey?: string; authenticated?: boolean } = {},
  ): Promise<T> {
    const meta: Record<string, unknown> = {
      "ucp-agent": { profile: getAgentProfileUrl() },
    };
    if (options.idempotencyKey) {
      meta["idempotency-key"] = options.idempotencyKey;
    }
    const result = await this.request(
      "tools/call",
      { name: tool, arguments: { ...args, meta } },
      tool,
      options.authenticated ?? this.options.authenticated ?? false,
    );
    if (result.isError || result.structuredContent === undefined) {
      throw new CommerceError(
        "MCP_ERROR",
        `Shopify ${tool} returned no structured result`,
        502,
      );
    }
    return result.structuredContent as T;
  }

  private async request(
    method: "tools/list" | "tools/call",
    params: Record<string, unknown>,
    operation: string,
    authenticated: boolean,
  ) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const fetcher = this.options.fetcher ?? fetch;
    const canRetry = SAFE_RETRY_TOOLS.has(operation);
    const attempts = canRetry ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs ?? 15_000,
      );
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Aladdyn-Request-Id": requestId,
        };
        if (authenticated) {
          headers.Authorization = `Bearer ${await getShopifyAgentToken(fetcher)}`;
        }
        const response = await fetcher(this.options.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            method,
            params,
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const retryAfter = response.headers.get("retry-after");
        console.info("commerce.ucp.mcp", {
          requestId,
          shopDomain: this.options.shopDomain,
          operation,
          latencyMs: Date.now() - startedAt,
          status: response.status,
          retryAfter,
          attempt,
        });

        if (response.status === 429) {
          if (canRetry && attempt + 1 < attempts) {
            await waitForRetry(retryDelay(attempt, retryAfter));
            continue;
          }
          throw new CommerceError(
            "COMMERCE_THROTTLED",
            "Shopify rate limit reached",
            429,
            true,
            requestId,
          );
        }
        if (!response.ok) {
          if (canRetry && response.status >= 500 && attempt + 1 < attempts) {
            await waitForRetry(retryDelay(attempt, retryAfter));
            continue;
          }
          throw new CommerceError(
            "MCP_ERROR",
            `Shopify ${operation} failed with HTTP ${response.status}`,
            response.status >= 500 ? 502 : 400,
            response.status >= 500,
            requestId,
          );
        }
        const envelope = jsonRpcEnvelopeSchema.safeParse(await response.json());
        if (!envelope.success) {
          throw new CommerceError(
            "MCP_ERROR",
            "Shopify returned an invalid JSON-RPC response",
            502,
            false,
            requestId,
          );
        }
        if (envelope.data.error) {
          throw new CommerceError(
            "MCP_ERROR",
            `Shopify rejected ${operation}: ${envelope.data.error.message}`,
            400,
            false,
            requestId,
          );
        }
        if (!envelope.data.result) {
          throw new CommerceError(
            "MCP_ERROR",
            "Shopify returned no JSON-RPC result",
            502,
            false,
            requestId,
          );
        }
        return envelope.data.result;
      } catch (error) {
        if (error instanceof CommerceError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new CommerceError(
            "MCP_TIMEOUT",
            `Shopify ${operation} timed out`,
            504,
            true,
            requestId,
          );
        }
        if (canRetry && attempt + 1 < attempts) {
          await waitForRetry(retryDelay(attempt, null));
          continue;
        }
        throw new CommerceError(
          "MCP_ERROR",
          `Shopify ${operation} could not be reached`,
          502,
          true,
          requestId,
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new CommerceError("MCP_ERROR", "Shopify MCP request failed", 502);
  }
}
