import "server-only";

import { getServerEnv } from "@/lib/env";
import {
  getFreshAccessToken,
  markNeedsReauthorization,
  type ConnectionRecord,
} from "@/lib/shopify/connection";
import { AppError } from "@/lib/shopify/errors";
import { normalizeShopDomain } from "@/lib/shopify/domain";

type GraphQLError = { message: string; extensions?: { code?: string } };
type CostExtensions = {
  cost?: {
    requestedQueryCost?: number;
    actualQueryCost?: number;
    throttleStatus?: {
      maximumAvailable?: number;
      currentlyAvailable?: number;
      restoreRate?: number;
    };
  };
};

export type GraphQLCost = {
  requestedCost: number;
  actualCost: number;
  currentlyAvailable: number;
  restoreRate: number;
};

const APP_UNINSTALL_MUTATION = `mutation DisconnectShopifyApp {
  appUninstall {
    app { id }
    userErrors { message }
  }
}`;

export async function uninstallShopifyApp(connection: ConnectionRecord) {
  const response = await shopifyGraphQL<{
    appUninstall: {
      app: { id: string } | null;
      userErrors: { message: string }[];
    };
  }>(connection, APP_UNINSTALL_MUTATION);
  const userError = response.data.appUninstall.userErrors[0];
  if (userError) {
    throw new AppError(
      "SHOPIFY_GRAPHQL_ERROR",
      userError.message.slice(0, 400),
      502,
    );
  }
}

export async function shopifyGraphQL<T>(
  connection: ConnectionRecord,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T; graphQL: GraphQLCost }> {
  const shop = normalizeShopDomain(connection.shop_domain);
  const accessToken = await getFreshAccessToken(connection);
  try {
    return await shopifyGraphQLWithAccessToken<T>(
      shop,
      accessToken,
      query,
      variables,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "TOKEN_REVOKED") {
      await markNeedsReauthorization(
        connection.id,
        "Shopify rejected the access token",
      );
    }
    throw error;
  }
}

export async function shopifyGraphQLWithAccessToken<T>(
  shopInput: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T; graphQL: GraphQLCost }> {
  const env = getServerEnv();
  const shop = normalizeShopDomain(shopInput);
  let response: Response;

  try {
    response = await fetch(
      `https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(env.SHOPIFY_REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch {
    throw new AppError("NETWORK_ERROR", "Shopify could not be reached", 503);
  }

  if (response.status === 401) {
    throw new AppError(
      "TOKEN_REVOKED",
      "Shopify access was revoked. Reconnect the store.",
      401,
    );
  }
  if (response.status === 403) {
    throw new AppError(
      "SHOP_ACCESS_DENIED",
      "Shopify denied access to this resource",
      403,
    );
  }
  if (response.status === 429) {
    throw new AppError(
      "SHOPIFY_THROTTLED",
      "Shopify is throttling requests. Retry shortly.",
      429,
    );
  }
  if (!response.ok) {
    throw new AppError(
      "NETWORK_ERROR",
      `Shopify returned HTTP ${response.status}`,
      502,
    );
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: GraphQLError[];
    extensions?: CostExtensions;
  };
  if (payload.errors?.length) {
    const message = payload.errors
      .map((item) => item.message)
      .join("; ")
      .slice(0, 400);
    const code = payload.errors.some(
      (item) => item.extensions?.code === "THROTTLED",
    )
      ? "SHOPIFY_THROTTLED"
      : "SHOPIFY_GRAPHQL_ERROR";
    throw new AppError(code, message, code === "SHOPIFY_THROTTLED" ? 429 : 502);
  }
  if (!payload.data)
    throw new AppError(
      "SHOPIFY_GRAPHQL_ERROR",
      "Shopify returned no data",
      502,
    );

  const cost = payload.extensions?.cost;
  return {
    data: payload.data,
    graphQL: {
      requestedCost: cost?.requestedQueryCost ?? 0,
      actualCost: cost?.actualQueryCost ?? 0,
      currentlyAvailable: cost?.throttleStatus?.currentlyAvailable ?? 0,
      restoreRate: cost?.throttleStatus?.restoreRate ?? 0,
    },
  };
}
