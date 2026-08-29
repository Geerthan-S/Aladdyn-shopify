export const runtime = "nodejs";

import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { SHOPPING_EVENT_TYPES, trackEvent } from "@/lib/personalization/events";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";

const requestSchema = z.object({
  customerId: z.string().trim().min(1).max(200),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/),
  eventType: z.enum(SHOPPING_EVENT_TYPES),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopping-events", 120, 60);
    const input = requestSchema.parse(await request.json());
    const connection = await getConnectionForUser(user.id);
    if (!connection || connection.status !== "connected") {
      throw new AppError("CONNECTION_NOT_FOUND", "Connect Shopify first", 409);
    }
    const admin = createAdminSupabase();
    const { data: store } = await admin
      .from("stores")
      .select("id")
      .eq("connection_id", connection.id)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!store)
      throw new AppError("SHOP_ACCESS_DENIED", "Store unavailable", 403);
    const event = await trackEvent({ storeId: store.id, ...input });
    return Response.json(
      { accepted: true, eventId: event.id },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_EVENT", message: error.issues[0].message } },
        { status: 400 },
      );
    }
    return safeErrorResponse(error);
  }
}
