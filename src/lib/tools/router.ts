import "server-only";

import { explicitActionSchema } from "@/lib/commerce/schemas";
import {
  routeGenieMessage,
  type ExplicitAction,
} from "@/lib/commerce/tool-router";
import type { GenieResponse } from "@commerce-agent/providers/types";
import { assertCommerceToolPermission } from "@commerce-agent/tools/router";
import {
  trackEvent,
  type ShoppingEventType,
} from "@/lib/personalization/events";
import type { ConnectionRecord } from "@/lib/shopify/connection";
import { AppError } from "@/lib/shopify/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isPrototypeSchemaMissing } from "@/lib/prototype/schema";
import { majorUnits } from "@commerce-agent/money";

const ALLOWED_TOOLS = new Set<ExplicitAction["tool"]>([
  "search_products",
  "recommend_products",
  "expand_results",
  "recommend_previous",
  "get_product",
  "add_product_to_cart",
  "view_cart",
  "add_to_cart",
  "remove_from_cart",
  "change_quantity",
  "checkout",
  "get_checkout_status",
]);

export async function executePermittedTool(input: {
  userId: string;
  connection: ConnectionRecord;
  conversationId: string;
  messageId: string;
  message: string;
  customerKey: string;
  action: ExplicitAction;
  expectedStoreId?: string;
}): Promise<GenieResponse> {
  assertToolPermission(input.userId, input.connection, input.action);
  const action = explicitActionSchema.parse(input.action) as ExplicitAction;
  const storeId = await authorizedStoreId(
    input.userId,
    input.connection.id,
    input.expectedStoreId,
  );
  const result = await routeGenieMessage({
    userId: input.userId,
    storeDomain: input.connection.shop_domain,
    conversationId: input.conversationId,
    messageId: input.messageId,
    message: input.message,
    action,
  });
  const event = eventForAction(action, result);
  if (event && storeId) {
    void trackEvent({
      storeId,
      customerId: input.customerKey,
      sessionId: input.conversationId,
      eventType: event.type,
      metadata: event.metadata,
    }).catch((error) =>
      console.warn("shopping.event.track_skipped", {
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  return result;
}

export function assertToolPermission(
  userId: string,
  connection: ConnectionRecord,
  action: ExplicitAction,
) {
  try {
    assertCommerceToolPermission({
      actorId: userId,
      ownerId: connection.user_id,
      connectionStatus: connection.status,
      tool: action.tool,
      allowedTools: ALLOWED_TOOLS,
    });
  } catch {
    throw new AppError(
      "SHOP_ACCESS_DENIED",
      "This user cannot execute tools for the selected store",
      403,
    );
  }
}

async function authorizedStoreId(
  userId: string,
  connectionId: string,
  expectedStoreId?: string,
): Promise<string | null> {
  const admin = createAdminSupabase();
  let query = admin
    .from("stores")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("connection_id", connectionId);
  if (expectedStoreId) query = query.eq("id", expectedStoreId);
  const { data, error } = await query.maybeSingle();
  if (error && isPrototypeSchemaMissing(error)) return null;
  if (error || !data) {
    throw new AppError(
      "SHOP_ACCESS_DENIED",
      "The selected store is not authorized for this user",
      403,
    );
  }
  return data.id as string;
}

function eventForAction(action: ExplicitAction, result: GenieResponse) {
  const common = result.products?.[0];
  switch (action.tool) {
    case "search_products":
    case "recommend_products":
    case "recommend_previous":
      return {
        type: "SEARCH" as ShoppingEventType,
        metadata: {
          query: String(action.input.query ?? ""),
          source: action.tool,
        },
      };
    case "get_product":
      return {
        type: "PRODUCT_VIEW" as ShoppingEventType,
        metadata: {
          productId: action.input.productId,
          productTitle: common?.title,
          category: common?.productType,
          price: common ? majorUnits(common.price) : undefined,
          currency: common?.price.currency,
        },
      };
    case "add_to_cart":
    case "add_product_to_cart":
      return {
        type: "ADD_CART" as ShoppingEventType,
        metadata: {
          variantId:
            "variantId" in action.input ? action.input.variantId : undefined,
          productQuery:
            "productQuery" in action.input
              ? action.input.productQuery
              : undefined,
          quantity: action.input.quantity,
        },
      };
    case "remove_from_cart":
      return {
        type: "REMOVE_CART" as ShoppingEventType,
        metadata: { variantId: action.input.variantId },
      };
    default:
      return null;
  }
}
