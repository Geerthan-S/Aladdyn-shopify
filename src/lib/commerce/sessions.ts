import "server-only";

import { CommerceError } from "@commerce-agent/tools/errors";
import { createCartAttribution } from "@shopify-adapter/ucp/attribution";
import type {
  AuthoritativeCartState,
  CommerceProduct,
  CommerceSession,
  ProviderCapabilities,
} from "@commerce-agent/providers/types";
import { SHOPIFY_UCP_VERSION } from "@shopify-adapter/capabilities";
import { createAdminSupabase } from "@/lib/supabase/admin";

type SessionRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  provider: string;
  store_domain: string;
  ucp_version: string;
  mcp_endpoint: string;
  cart_id: string | null;
  cart_state_json: AuthoritativeCartState;
  cart_version: number;
  checkout_id: string | null;
  checkout_status: string | null;
  continue_url: string | null;
  last_products_json: CommerceProduct[] | null;
  last_variant_id: string | null;
};

function mapSession(row: SessionRow): CommerceSession {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    provider: "shopify",
    storeDomain: row.store_domain,
    ucpVersion: SHOPIFY_UCP_VERSION,
    mcpEndpoint: row.mcp_endpoint,
    cartId: row.cart_id,
    cartState: row.cart_state_json,
    cartVersion: row.cart_version,
    checkoutId: row.checkout_id,
    checkoutStatus: row.checkout_status,
    continueUrl: row.continue_url,
    lastProducts: Array.isArray(row.last_products_json)
      ? row.last_products_json
      : [],
    lastVariantId: row.last_variant_id,
  };
}

export async function getOrCreateCommerceSession(input: {
  userId: string;
  conversationId: string;
  storeDomain: string;
  capabilities: ProviderCapabilities;
  channel?: string;
  campaign?: string | null;
}) {
  const admin = createAdminSupabase();
  const { data: existing, error } = await admin
    .from("chat_commerce_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("conversation_id", input.conversationId)
    .maybeSingle();
  if (error) throw databaseError("Unable to read the shopping session");
  if (existing) {
    const row = existing as SessionRow;
    if (row.store_domain !== input.storeDomain) {
      throw new CommerceError(
        "CART_CONFLICT",
        "This conversation belongs to a different store",
        409,
      );
    }
    if (!input.capabilities.endpoint) {
      throw new Error("Commerce connector endpoint is missing");
    }
    if (row.mcp_endpoint !== input.capabilities.endpoint) {
      await admin
        .from("chat_commerce_sessions")
        .update({
          mcp_endpoint: input.capabilities.endpoint,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      row.mcp_endpoint = input.capabilities.endpoint;
    }
    return mapSession(row);
  }

  const state: AuthoritativeCartState = {
    lineItems: [],
    context: {},
    attribution: createCartAttribution(
      input.conversationId,
      input.channel,
      input.campaign,
    ),
  };
  const { data, error: insertError } = await admin
    .from("chat_commerce_sessions")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      provider: "shopify",
      store_domain: input.storeDomain,
      ucp_version: SHOPIFY_UCP_VERSION,
      mcp_endpoint: input.capabilities.endpoint,
      cart_state_json: state,
      channel: input.channel ?? "web_chat",
      campaign: input.campaign ?? null,
    })
    .select("*")
    .single();
  if (insertError || !data) {
    throw databaseError("Unable to create the shopping session");
  }
  return mapSession(data as SessionRow);
}

export async function readCommerceSession(
  userId: string,
  conversationId: string,
) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("chat_commerce_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw databaseError("Unable to read the shopping session");
  return data ? mapSession(data as SessionRow) : null;
}

export async function saveSearchContext(input: {
  userId: string;
  sessionId: string;
  products: CommerceProduct[];
  lastVariantId?: string | null;
}) {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("chat_commerce_sessions")
    .update({
      last_products_json: input.products.slice(0, 10),
      last_variant_id: input.lastVariantId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId);
  if (error) throw databaseError("Unable to save the product selection");
}

export async function updateCheckoutState(input: {
  userId: string;
  sessionId: string;
  checkoutId: string;
  status: string;
  continueUrl: string;
}) {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("chat_commerce_sessions")
    .update({
      checkout_id: input.checkoutId,
      checkout_status: input.status,
      continue_url: input.continueUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId);
  if (error) throw databaseError("Unable to save checkout status");
}

export type BegunOperation = {
  replayed: boolean;
  operationId: string;
  operationStatus: "processing" | "completed" | "failed";
  response: unknown;
  session: CommerceSession;
};

export async function beginCommerceOperation(input: {
  session: CommerceSession;
  operationType: string;
  idempotencyKey: string;
  requestHash: string;
  desiredCartState: AuthoritativeCartState;
  mutatesCart: boolean;
}) {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("begin_commerce_operation", {
    p_user_id: input.session.userId,
    p_conversation_id: input.session.conversationId,
    p_store_domain: input.session.storeDomain,
    p_ucp_version: input.session.ucpVersion,
    p_mcp_endpoint: input.session.mcpEndpoint,
    p_operation_type: input.operationType,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_expected_cart_version: input.session.cartVersion,
    p_desired_cart_state: input.desiredCartState,
    p_mutates_cart: input.mutatesCart,
    p_channel: "web_chat",
    p_campaign: null,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (/CART_VERSION_CONFLICT|CART_BUSY|IDEMPOTENCY_KEY_REUSE/.test(message)) {
      throw new CommerceError(
        "CART_CONFLICT",
        "The cart changed during this operation",
        409,
        true,
      );
    }
    throw databaseError("Unable to reserve the cart update");
  }
  const payload = data as {
    replayed: boolean;
    operationId: string;
    operationStatus: BegunOperation["operationStatus"];
    response: unknown;
    session: SessionRow;
  };
  console.info("commerce.operation.idempotency", {
    conversationId: input.session.conversationId,
    shopDomain: input.session.storeDomain,
    operation: input.operationType,
    result: payload.replayed ? "hit" : "miss",
  });
  return { ...payload, session: mapSession(payload.session) } as BegunOperation;
}

export async function finishCommerceOperation(input: {
  userId: string;
  operationId: string;
  status: "completed" | "failed";
  response?: unknown;
  errorCode?: string | null;
  cartId?: string | null;
  providerCart?: unknown;
  checkoutId?: string | null;
  checkoutStatus?: string | null;
  continueUrl?: string | null;
}) {
  const admin = createAdminSupabase();
  const { error } = await admin.rpc("finish_commerce_operation", {
    p_user_id: input.userId,
    p_operation_id: input.operationId,
    p_status: input.status,
    p_response_snapshot: input.response ?? null,
    p_error_code: input.errorCode ?? null,
    p_cart_id: input.cartId ?? null,
    p_provider_cart_json: input.providerCart ?? null,
    p_checkout_id: input.checkoutId ?? null,
    p_checkout_status: input.checkoutStatus ?? null,
    p_continue_url: input.continueUrl ?? null,
  });
  if (error) throw databaseError("Unable to finish the commerce operation");
}

function databaseError(message: string) {
  return new CommerceError("MCP_ERROR", message, 503, true);
}
