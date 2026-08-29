import "server-only";

import type { ConnectionRecord } from "@/lib/shopify/connection";
import { AppError } from "@/lib/shopify/errors";
import { fetchProductPage } from "@/lib/shopify/products";
import { canSyncCustomers, fetchCustomerPage } from "@/lib/shopify/customers";
import { fetchOrderPage } from "@/lib/shopify/orders";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { refreshProductEmbeddings } from "@/lib/knowledge/products";

const SHOP_QUERY = `query SyncShop { shop { id name myshopifyDomain currencyCode ianaTimezone } }`;

export type SyncStatus = {
  status: "not_synced" | "syncing" | "ready" | "failed" | "setup_required";
  productCount: number;
  lastSyncedAt: string | null;
  error: string | null;
};

export async function getSyncStatus(connectionId: string): Promise<SyncStatus> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("stores")
    .select("sync_status,sync_product_count,last_synced_at,sync_error")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (error) {
    if (/stores|schema cache|does not exist/i.test(error.message)) {
      return {
        status: "setup_required",
        productCount: 0,
        lastSyncedAt: null,
        error: "Apply migration 003_ai_commerce_prototype.sql",
      };
    }
    throw new AppError("NETWORK_ERROR", "Unable to read sync status", 503);
  }
  return data
    ? {
        status: data.sync_status as SyncStatus["status"],
        productCount: data.sync_product_count,
        lastSyncedAt: data.last_synced_at,
        error: data.sync_error,
      }
    : {
        status: "not_synced",
        productCount: 0,
        lastSyncedAt: null,
        error: null,
      };
}

export async function syncShopifyStore(connection: ConnectionRecord) {
  const admin = createAdminSupabase();
  const shop = await shopifyGraphQL<{
    shop: {
      id: string;
      name: string;
      myshopifyDomain: string;
      currencyCode: string;
      ianaTimezone: string;
    };
  }>(connection, SHOP_QUERY);
  const { data: store, error: storeError } = await admin
    .from("stores")
    .upsert(
      {
        owner_user_id: connection.user_id,
        connection_id: connection.id,
        shop_domain: connection.shop_domain,
        shopify_shop_id: shop.data.shop.id,
        name: shop.data.shop.name,
        currency_code: shop.data.shop.currencyCode,
        timezone: shop.data.shop.ianaTimezone,
        sync_status: "syncing",
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    )
    .select("id")
    .single();
  if (storeError || !store) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      "Apply the AI commerce database migration before syncing",
      503,
    );
  }

  const maximum = Math.min(
    Math.max(Number(process.env.SHOPIFY_SYNC_MAX_PRODUCTS ?? 1000), 1),
    5000,
  );
  let cursor: string | null = null;
  let count = 0;
  let embedded = 0;
  let embeddingStatus: "ready" | "not_configured" | "failed" = "not_configured";
  try {
    do {
      const page = await fetchProductPage(
        connection,
        cursor,
        Math.min(50, maximum - count),
      );
      if (page.products.length) {
        const { error } = await admin.from("products").upsert(
          page.products.map((product) => ({ ...product, store_id: store.id })),
          { onConflict: "store_id,shopify_product_id" },
        );
        if (error) throw error;
        try {
          const embeddingResult = await refreshProductEmbeddings({
            storeId: store.id,
            shopifyProductIds: page.products.map(
              (product) => product.shopify_product_id,
            ),
          });
          embeddingStatus = embeddingResult.status;
          embedded += embeddingResult.updated;
        } catch (error) {
          // Normalized Shopify data remains useful to the chatbot even when
          // optional semantic indexing is temporarily unavailable.
          embeddingStatus = "failed";
          console.warn("shopify.sync.embedding_skipped", {
            reason: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      count += page.products.length;
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor && count < maximum);

    const [customers, orders] = await Promise.all([
      syncCustomers(connection, store.id),
      syncOrders(connection, store.id),
    ]);
    const now = new Date().toISOString();
    await admin
      .from("stores")
      .update({
        sync_status: "ready",
        sync_product_count: count,
        last_synced_at: now,
        sync_error: null,
        updated_at: now,
      })
      .eq("id", store.id);
    return {
      status: "ready" as const,
      productCount: count,
      embeddings: { status: embeddingStatus, updated: embedded },
      customerContext: customers,
      orderContext: orders,
      lastSyncedAt: now,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await admin
      .from("stores")
      .update({
        sync_status: "failed",
        sync_error: message.slice(0, 300),
        updated_at: new Date().toISOString(),
      })
      .eq("id", store.id);
    throw new AppError("NETWORK_ERROR", "Shopify product sync failed", 502);
  }
}

async function syncCustomers(connection: ConnectionRecord, storeId: string) {
  if (!canSyncCustomers(connection)) return "not_authorized" as const;
  const admin = createAdminSupabase();
  let cursor: string | null = null;
  let count = 0;
  try {
    do {
      const page = await fetchCustomerPage(connection, cursor);
      if (!page) return "not_authorized" as const;
      if (page.nodes.length) {
        const { error } = await admin.from("customers").upsert(
          page.nodes.map((customer) => ({
            store_id: storeId,
            shopify_customer_id: customer.id,
            display_name: customer.displayName,
            tags: customer.tags,
            protected_data_authorized: true,
            commerce_summary: {
              numberOfOrders: customer.numberOfOrders,
              amountSpent: customer.amountSpent,
            },
            source_updated_at: customer.updatedAt,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "store_id,shopify_customer_id" },
        );
        if (error) throw error;
      }
      count += page.nodes.length;
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor && count < 250);
    return `authorized:${count}` as const;
  } catch {
    return "approval_or_scope_unavailable" as const;
  }
}

async function syncOrders(connection: ConnectionRecord, storeId: string) {
  const admin = createAdminSupabase();
  let cursor: string | null = null;
  let count = 0;
  try {
    do {
      const page = await fetchOrderPage(
        connection,
        cursor,
        canSyncCustomers(connection),
      );
      if (!page) return "not_authorized" as const;
      if (page.nodes.length) {
        const { error } = await admin.from("orders").upsert(
          page.nodes.map((order) => ({
            store_id: storeId,
            shopify_order_id: order.id,
            shopify_customer_id: order.customer?.id ?? null,
            purchased_items: order.lineItems.nodes,
            total_amount: Number(order.currentTotalPriceSet.shopMoney.amount),
            currency_code: order.currentTotalPriceSet.shopMoney.currencyCode,
            ordered_at: order.createdAt,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "store_id,shopify_order_id" },
        );
        if (error) throw error;
      }
      count += page.nodes.length;
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor && count < 250);
    return `authorized:${count}` as const;
  } catch {
    return "approval_or_scope_unavailable" as const;
  }
}
