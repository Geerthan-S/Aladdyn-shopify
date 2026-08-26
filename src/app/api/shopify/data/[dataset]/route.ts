export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";
import { getConnectionForUser } from "@/lib/shopify/connection";
import {
  DATASET_QUERIES,
  DATASET_SCOPES,
  datasetNameSchema,
  paginationSchema,
  paginationVariables,
  type DatasetName,
} from "@/lib/shopify/datasets";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import { hasAllScopes } from "@/lib/shopify/scopes";

type ConnectionPayload = {
  nodes?: unknown[];
  pageInfo?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

const dataKeys: Partial<Record<DatasetName, string>> = {
  products: "products",
  variants: "productVariants",
  collections: "collections",
  inventory: "inventoryItems",
  locations: "locations",
  orders: "orders",
  discounts: "discountNodes",
};

const emptyPageInfo: NonNullable<ConnectionPayload["pageInfo"]> = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/shopify/data/[dataset]">,
) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopify-data", 120, 60);
    const { dataset: rawDataset } = await context.params;
    const parsedDataset = datasetNameSchema.safeParse(rawDataset);
    if (!parsedDataset.success) {
      throw new AppError("INVALID_DATASET", "Unknown Shopify dataset", 404);
    }
    const dataset = parsedDataset.data;
    const parsedPagination = paginationSchema.safeParse({
      after: request.nextUrl.searchParams.get("after") || undefined,
      before: request.nextUrl.searchParams.get("before") || undefined,
      limit: request.nextUrl.searchParams.get("limit") || undefined,
    });
    if (!parsedPagination.success) {
      throw new AppError(
        "INVALID_CURSOR",
        parsedPagination.error.issues[0].message,
        400,
      );
    }

    const connection = await getConnectionForUser(user.id);
    if (
      !connection ||
      connection.status === "disconnected" ||
      connection.status === "uninstalled"
    ) {
      throw new AppError(
        "CONNECTION_NOT_FOUND",
        "Connect Shopify to inspect store data",
        404,
      );
    }

    const requiredScopes = DATASET_SCOPES[dataset];
    const access = {
      status: hasAllScopes(connection.granted_scopes, requiredScopes)
        ? "available"
        : "scope_missing",
      requiredScopes,
      grantedScopes: connection.granted_scopes,
    };

    if (!hasAllScopes(connection.granted_scopes, requiredScopes)) {
      return Response.json({
        dataset,
        items: [],
        pageInfo: emptyPageInfo,
        access,
        graphQL: {
          requestedCost: 0,
          actualCost: 0,
          currentlyAvailable: 0,
          restoreRate: 0,
        },
        fetchedAt: new Date().toISOString(),
      });
    }

    if (dataset === "protected-data") {
      return Response.json({
        dataset,
        items: [
          {
            status: "not_requested",
            customerProfiles:
              "Requires read_customers and Shopify protected customer data approval.",
            olderOrderHistory: "Requires read_all_orders and Shopify approval.",
            action:
              "Add approved scopes in Shopify, release the app configuration, then reconnect.",
          },
        ],
        pageInfo: emptyPageInfo,
        access,
        graphQL: {
          requestedCost: 0,
          actualCost: 0,
          currentlyAvailable: 0,
          restoreRate: 0,
        },
        fetchedAt: new Date().toISOString(),
      });
    }

    const query = DATASET_QUERIES[dataset];
    if (!query)
      throw new AppError(
        "SHOPIFY_GRAPHQL_ERROR",
        "Dataset is not configured",
        500,
      );
    const result = await shopifyGraphQL<Record<string, unknown>>(
      connection,
      query,
      paginationVariables(parsedPagination.data),
    );

    let items: unknown[];
    let pageInfo = emptyPageInfo;
    const key = dataKeys[dataset];
    if (key) {
      const payload = result.data[key] as ConnectionPayload;
      items = payload?.nodes ?? [];
      pageInfo = payload?.pageInfo ?? emptyPageInfo;
    } else if (dataset === "shop") {
      items = [result.data.shop];
    } else if (dataset === "scopes") {
      items = [result.data.appInstallation];
    } else {
      items = [];
    }

    return Response.json(
      {
        dataset,
        items,
        pageInfo,
        access,
        graphQL: result.graphQL,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
