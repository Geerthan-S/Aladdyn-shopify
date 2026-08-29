import "server-only";

import type { ConnectionRecord } from "@/lib/shopify/connection";
import { AppError } from "@/lib/shopify/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { detectCommerceIntent, type CommerceIntent } from "@/lib/ai/intent";
import { assembleCommerceContext } from "@commerce-agent/context/builder";
import { createShopifyCommerceProvider } from "@shopify-adapter";
import type { CommerceProduct } from "@commerce-agent/providers/types";
import { retrieveKnowledge } from "@/lib/knowledge";
import { retrieveProducts } from "@/lib/knowledge/products";
import {
  buildPreferenceProfile,
  getCustomerHistory,
} from "@/lib/personalization/events";
import { isPrototypeSchemaMissing } from "@/lib/prototype/schema";
import { canonicalMajorMoney, canonicalMoney } from "@commerce-agent/money";

export type ConversationContext = {
  storeId: string | null;
  conversationDbId: string | null;
  customerKey: string;
  intent: CommerceIntent;
  systemContext: string;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  profile: {
    preferredCategories: string[];
    preferredColors: string[];
    preferredSizes: string[];
    budgetMin: number | null;
    budgetMax: number | null;
  };
};

export async function buildConversationContext(input: {
  connection: ConnectionRecord;
  conversationId: string;
  message: string;
  customerKey?: string;
}): Promise<ConversationContext> {
  const admin = createAdminSupabase();
  const customerKey =
    input.customerKey?.trim() || `visitor:${input.conversationId}`;
  const { data: store, error: storeError } = await admin
    .from("stores")
    .upsert(
      {
        owner_user_id: input.connection.user_id,
        connection_id: input.connection.id,
        shop_domain: input.connection.shop_domain,
        shopify_shop_id: input.connection.shopify_shop_id,
        name: input.connection.shop_name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    )
    .select(
      "id,name,currency_code,sync_status,sync_product_count,last_synced_at",
    )
    .single();
  if (storeError || !store) {
    if (isPrototypeSchemaMissing(storeError)) {
      return buildLivePrototypeContext(input, customerKey);
    }
    throw prototypeMigrationError();
  }

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .upsert(
      {
        store_id: store.id,
        owner_user_id: input.connection.user_id,
        session_id: input.conversationId,
        customer_key: customerKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,session_id" },
    )
    .select("id")
    .single();
  if (conversationError || !conversation) {
    if (isPrototypeSchemaMissing(conversationError)) {
      return buildLivePrototypeContext(input, customerKey);
    }
    throw prototypeMigrationError();
  }

  const [{ data: messageRows }, { data: profileRow }] = await Promise.all([
    admin
      .from("messages")
      .select("role,content")
      .eq("conversation_id", conversation.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("customer_profiles")
      .select(
        "preferred_categories,preferred_colors,preferred_sizes,budget_min,budget_max",
      )
      .eq("store_id", store.id)
      .eq("customer_key", customerKey)
      .maybeSingle(),
  ]);

  const profile = {
    preferredCategories: profileRow?.preferred_categories ?? [],
    preferredColors: profileRow?.preferred_colors ?? [],
    preferredSizes: profileRow?.preferred_sizes ?? [],
    budgetMin:
      profileRow?.budget_min == null ? null : Number(profileRow.budget_min),
    budgetMax:
      profileRow?.budget_max == null ? null : Number(profileRow.budget_max),
  };
  const recentMessages = (messageRows ?? [])
    .reverse()
    .map((row) => ({ role: row.role, content: row.content }));
  const [history, products, merchantRules] = await Promise.all([
    safe(() => getCustomerHistory(store.id, customerKey, 100), []),
    safe(() => retrieveProducts(store.id, input.message, 8), []),
    safe(() => retrieveKnowledge(store.id, input.message, 5), []),
  ]);
  const behaviorProfile = buildPreferenceProfile(history);
  const effectiveProfile = {
    preferredCategories: [
      ...new Set([
        ...profile.preferredCategories,
        ...behaviorProfile.preferredCategories,
      ]),
    ].slice(0, 10),
    preferredColors: [
      ...new Set([
        ...profile.preferredColors,
        ...behaviorProfile.preferredColors,
      ]),
    ].slice(0, 10),
    preferredSizes: profile.preferredSizes,
    budgetMin: profile.budgetMin ?? behaviorProfile.budget?.min ?? null,
    budgetMax: profile.budgetMax ?? behaviorProfile.budget?.max ?? null,
  };
  const intent = detectCommerceIntent(input.message);
  const context = assembleCommerceContext({
    intent,
    explicitProfile: profile,
    effectiveProfile,
    behaviorProfile,
    purchaseHistoryAuthorized:
      input.connection.granted_scopes.includes("read_customers"),
    products: products.map((product) => ({
      productId: product.shopifyProductId,
      name: product.name,
      category: product.category,
      description: product.description,
      colors: product.colors,
      sizes: product.sizes,
      price:
        product.priceMin !== null && product.currency
          ? canonicalMajorMoney(product.priceMin, product.currency)
          : null,
      maximumPrice:
        product.priceMax !== null && product.currency
          ? canonicalMajorMoney(product.priceMax, product.currency)
          : null,
      indexedAvailability: product.availability,
      similarity: product.similarity,
      warning: "Candidate only; verify live facts with a commerce tool.",
    })),
    merchantRules: merchantRules.map((knowledge) => ({
      type: knowledge.type,
      content: knowledge.content,
      similarity: knowledge.similarity,
    })),
    recentMessages,
    availableTools: [
      "search_products",
      "get_product_details",
      "recommend_products",
      "create_cart",
      "view_cart",
      "checkout",
    ],
    store: {
      name:
        store.name ??
        input.connection.shop_name ??
        input.connection.shop_domain,
      domain: input.connection.shop_domain,
      currency: store.currency_code ?? "unknown",
      syncStatus: store.sync_status,
      syncedProductCount: store.sync_product_count,
      lastSyncedAt: store.last_synced_at,
    },
    checkoutMode: "secure_shopify_handoff",
  });

  return {
    storeId: store.id,
    conversationDbId: conversation.id,
    customerKey,
    intent,
    systemContext: JSON.stringify(context),
    recentMessages,
    profile: effectiveProfile,
  };
}

async function safe<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.warn("ai.context.optional_retrieval_skipped", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return fallback;
  }
}

export async function saveConversationMessage(input: {
  conversationDbId: string | null;
  clientMessageId?: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
  generatedContext?: unknown;
  model?: string | null;
}) {
  if (!input.conversationDbId) return;
  const admin = createAdminSupabase();
  const { error } = await admin.from("messages").upsert(
    {
      conversation_id: input.conversationDbId,
      client_message_id: input.clientMessageId ?? null,
      role: input.role,
      content: input.content.slice(0, 20_000),
      tool_name: input.toolName ?? null,
      generated_context: input.generatedContext ?? null,
      model: input.model ?? null,
    },
    { onConflict: "conversation_id,client_message_id" },
  );
  if (error) throw prototypeMigrationError();
}

async function buildLivePrototypeContext(
  input: {
    connection: ConnectionRecord;
    conversationId: string;
    message: string;
    customerKey?: string;
  },
  customerKey: string,
): Promise<ConversationContext> {
  const intent = detectCommerceIntent(input.message);
  const profile = emptyProfile();
  const products = await safe(async () => {
    const provider = await createShopifyCommerceProvider(
      input.connection.shop_domain,
    );
    return provider.searchProducts({
      query: input.message,
      currency: "INR",
      country: "IN",
      limit: 6,
    });
  }, [] as CommerceProduct[]);
  const context = assembleCommerceContext({
    intent,
    explicitProfile: profile,
    effectiveProfile: profile,
    behaviorProfile: { source: "prototype_live_shopify_fallback" },
    purchaseHistoryAuthorized: false,
    products: products.map((product) => ({
      productId: product.productId,
      name: product.title,
      category: product.productType,
      description: product.description,
      colors: product.variants
        .flatMap((variant) => variant.options)
        .filter((option) => option.name.toLowerCase() === "color")
        .map((option) => option.value),
      sizes: product.variants
        .flatMap((variant) => variant.options)
        .filter((option) => option.name.toLowerCase() === "size")
        .map((option) => option.value),
      price: canonicalMoney(product.price),
      indexedAvailability: product.availability,
      warning: "Live Shopify fallback candidate; verify details with tools.",
    })),
    merchantRules: [],
    recentMessages: [],
    availableTools: [
      "search_products",
      "get_product_details",
      "recommend_products",
      "create_cart",
      "view_cart",
      "checkout",
    ],
    store: {
      name: input.connection.shop_name ?? input.connection.shop_domain,
      domain: input.connection.shop_domain,
      currency: products[0]?.price.currency ?? "unknown",
      syncStatus: "prototype_live_shopify_fallback",
      syncedProductCount: products.length,
      lastSyncedAt: null,
      note: "Database migration 003 is not applied, so this request is using live Shopify catalog fallback.",
    },
    checkoutMode: "secure_shopify_handoff",
  });

  return {
    storeId: null,
    conversationDbId: null,
    customerKey,
    intent,
    systemContext: JSON.stringify(context),
    recentMessages: [],
    profile,
  };
}

function emptyProfile() {
  return {
    preferredCategories: [],
    preferredColors: [],
    preferredSizes: [],
    budgetMin: null,
    budgetMax: null,
  };
}

function prototypeMigrationError() {
  return new AppError(
    "CONFIGURATION_REQUIRED",
    "Apply migration 003_ai_commerce_prototype.sql before using AI chat",
    503,
  );
}
