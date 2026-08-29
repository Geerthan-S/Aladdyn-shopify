import "server-only";

import { z } from "zod";
import { refreshProductEmbeddings } from "@/lib/knowledge/products";
import { getConnectionForShop } from "@/lib/shopify/connection";
import { fetchProductById } from "@/lib/shopify/products";
import { createAdminSupabase } from "@/lib/supabase/admin";

const webhookProductSchema = z.object({
  id: z.union([z.string(), z.number()]),
});

export async function processProductWebhook(
  topic: "products/create" | "products/update" | "products/delete",
  shopDomain: string,
  payload: unknown,
) {
  const { id } = webhookProductSchema.parse(payload);
  const productId = `gid://shopify/Product/${String(id)}`;
  const connection = await getConnectionForShop(shopDomain);
  if (!connection || connection.status !== "connected") {
    return { status: "connection_unavailable" as const };
  }
  const admin = createAdminSupabase();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (storeError || !store) throw new Error("Synced store is unavailable");

  if (topic === "products/delete") {
    const { error } = await admin
      .from("products")
      .delete()
      .eq("store_id", store.id)
      .eq("shopify_product_id", productId);
    if (error) throw new Error("Unable to delete synchronized product");
    await refreshStoreCount(store.id);
    return { status: "deleted" as const, productId };
  }

  const product = await fetchProductById(connection, productId);
  if (!product) {
    const { error } = await admin
      .from("products")
      .delete()
      .eq("store_id", store.id)
      .eq("shopify_product_id", productId);
    if (error) throw new Error("Unable to reconcile missing product");
    await refreshStoreCount(store.id);
    return { status: "deleted" as const, productId };
  }
  const { error } = await admin
    .from("products")
    .upsert(
      { ...product, store_id: store.id },
      { onConflict: "store_id,shopify_product_id" },
    );
  if (error) throw new Error("Unable to synchronize product webhook");
  let embeddings:
    | { status: "ready" | "not_configured"; updated: number }
    | { status: "failed"; updated: 0 };
  try {
    embeddings = await refreshProductEmbeddings({
      storeId: store.id,
      shopifyProductIds: [productId],
    });
  } catch (error) {
    embeddings = { status: "failed", updated: 0 };
    console.warn("shopify.webhook.embedding_skipped", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
  await refreshStoreCount(store.id);
  return { status: "updated" as const, productId, embeddings };
}

async function refreshStoreCount(storeId: string) {
  const admin = createAdminSupabase();
  const { count, error } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  if (error) return;
  await admin
    .from("stores")
    .update({
      sync_product_count: count ?? 0,
      last_synced_at: new Date().toISOString(),
      sync_status: "ready",
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId);
}
