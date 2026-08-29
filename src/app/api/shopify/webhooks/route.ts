export const runtime = "nodejs";

import { getServerEnv } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { verifyWebhookHmac } from "@/lib/shopify/hmac";
import { processProductWebhook } from "@/lib/shopify/product-webhooks";

const supportedTopics = new Set([
  "app/uninstalled",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "products/create",
  "products/update",
  "products/delete",
]);

export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (rawBody.length > 1_048_576) {
    return Response.json({ error: "WEBHOOK_TOO_LARGE" }, { status: 413 });
  }
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhookHmac(rawBody, hmac, getServerEnv().SHOPIFY_API_SECRET)) {
    return Response.json({ error: "INVALID_HMAC" }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic")?.toLowerCase();
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const shopHeader = request.headers.get("x-shopify-shop-domain");
  if (!topic || !webhookId || !shopHeader || !supportedTopics.has(topic)) {
    return Response.json({ error: "INVALID_WEBHOOK_HEADERS" }, { status: 400 });
  }

  let shop: string;
  try {
    shop = normalizeShopDomain(shopHeader);
  } catch {
    return Response.json({ error: "INVALID_SHOP" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { error: receiptError } = await admin
    .from("shopify_webhook_receipts")
    .insert({
      webhook_id: webhookId,
      topic,
      shop_domain: shop,
      status: "processing",
    });
  if (receiptError?.code === "23505") {
    const { data: receipt } = await admin
      .from("shopify_webhook_receipts")
      .select("status")
      .eq("webhook_id", webhookId)
      .maybeSingle();
    if (receipt?.status !== "failed") {
      return Response.json({ duplicate: true });
    }
    const { error: retryError } = await admin
      .from("shopify_webhook_receipts")
      .update({ status: "processing", error_message: null })
      .eq("webhook_id", webhookId)
      .eq("status", "failed");
    if (retryError) {
      return Response.json({ error: "RECEIPT_UNAVAILABLE" }, { status: 503 });
    }
  }
  if (receiptError && receiptError.code !== "23505")
    return Response.json({ error: "RECEIPT_UNAVAILABLE" }, { status: 503 });

  try {
    const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    if (topic === "app/uninstalled") {
      const { data: connection } = await admin
        .from("shopify_connections")
        .select("id")
        .eq("shop_domain", shop)
        .maybeSingle();
      if (connection) {
        await admin
          .from("shopify_connection_secrets")
          .delete()
          .eq("connection_id", connection.id);
        await admin
          .from("shopify_connections")
          .update({
            status: "uninstalled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
      }
    } else if (topic === "shop/redact") {
      await admin.from("shopify_connections").delete().eq("shop_domain", shop);
    } else if (topic === "customers/redact") {
      await redactCustomerData(shop, payload);
    } else if (
      topic === "products/create" ||
      topic === "products/update" ||
      topic === "products/delete"
    ) {
      await processProductWebhook(topic, shop, payload);
    }
    await admin
      .from("shopify_webhook_receipts")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("webhook_id", webhookId);
    return Response.json({ accepted: true });
  } catch {
    await admin
      .from("shopify_webhook_receipts")
      .update({ status: "failed", error_message: "Webhook processing failed" })
      .eq("webhook_id", webhookId);
    return Response.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}

async function redactCustomerData(shopDomain: string, payload: unknown) {
  const customer = (payload as { customer?: { id?: string | number } })
    ?.customer;
  if (customer?.id == null) return;
  const numericId = String(customer.id);
  const gid = `gid://shopify/Customer/${numericId}`;
  const admin = createAdminSupabase();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();
  if (!store) return;
  await Promise.all([
    admin
      .from("orders")
      .update({ shopify_customer_id: null })
      .eq("store_id", store.id)
      .in("shopify_customer_id", [numericId, gid]),
    admin
      .from("customers")
      .delete()
      .eq("store_id", store.id)
      .in("shopify_customer_id", [numericId, gid]),
    admin
      .from("shopping_events")
      .delete()
      .eq("store_id", store.id)
      .in("customer_id", [numericId, gid]),
    admin
      .from("customer_profiles")
      .delete()
      .eq("store_id", store.id)
      .in("customer_key", [numericId, gid]),
    admin
      .from("conversations")
      .delete()
      .eq("store_id", store.id)
      .in("customer_key", [numericId, gid]),
  ]);
}
