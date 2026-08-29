import "server-only";

import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  SHOPPING_EVENT_TYPES,
  type ShoppingEvent,
  type ShoppingEventType,
} from "@commerce-agent/personalization/types";
export { buildPreferenceProfile } from "@commerce-agent/personalization/preferences";
export { SHOPPING_EVENT_TYPES } from "@commerce-agent/personalization/types";
export type {
  ShoppingEvent,
  ShoppingEventType,
} from "@commerce-agent/personalization/types";

const eventSchema = z.object({
  storeId: z.uuid(),
  customerId: z.string().trim().min(1).max(200),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/),
  eventType: z.enum(SHOPPING_EVENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function trackEvent(raw: {
  storeId: string;
  customerId: string;
  sessionId: string;
  eventType: ShoppingEventType;
  metadata?: Record<string, unknown>;
}) {
  const input = eventSchema.parse(raw);
  const metadata = sanitizeMetadata(input.metadata);
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("shopping_events")
    .insert({
      store_id: input.storeId,
      customer_id: input.customerId,
      session_id: input.sessionId,
      event_type: input.eventType,
      metadata,
    })
    .select("id,event_type,metadata,created_at")
    .single();
  if (error || !data) throw new Error("Unable to record shopping behaviour");
  return mapEvent(data);
}

export async function getCustomerHistory(
  storeId: string,
  customerId: string,
  limit = 100,
) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("shopping_events")
    .select("id,event_type,metadata,created_at")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error("Unable to read shopping behaviour");
  return (data ?? []).map(mapEvent);
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  const allowed = [
    "query",
    "productId",
    "variantId",
    "productTitle",
    "category",
    "color",
    "size",
    "price",
    "currency",
    "quantity",
    "source",
  ];
  const safe = Object.fromEntries(
    allowed
      .filter((key) => key in metadata)
      .map((key) => [key, scalar(metadata[key])]),
  );
  if (JSON.stringify(safe).length > 12_000) {
    throw new Error("Shopping event metadata is too large");
  }
  return safe;
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string") return value.slice(0, 1_000);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean" || value === null) return value;
  return null;
}

function mapEvent(row: Record<string, unknown>): ShoppingEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type) as ShoppingEventType,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at),
  };
}
