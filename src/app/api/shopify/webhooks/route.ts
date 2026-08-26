export const runtime = "nodejs";

import { getServerEnv } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { verifyWebhookHmac } from "@/lib/shopify/hmac";

const supportedTopics = new Set([
  "app/uninstalled",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer());
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
  if (receiptError?.code === "23505") return Response.json({ duplicate: true });
  if (receiptError)
    return Response.json({ error: "RECEIPT_UNAVAILABLE" }, { status: 503 });

  try {
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
    }
    // Baseline queries retain no customer profiles or protected payloads, so customer
    // data request/redact topics require acknowledgement but no retained-data mutation.
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
