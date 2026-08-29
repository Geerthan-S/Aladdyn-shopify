export const runtime = "nodejs";

import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { addKnowledge, KNOWLEDGE_TYPES } from "@/lib/knowledge";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import { createAdminSupabase } from "@/lib/supabase/admin";

const knowledgeSchema = z.object({
  type: z.enum(KNOWLEDGE_TYPES),
  content: z.string().trim().min(1).max(20_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const storeId = await authorizedStore(user.id);
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("merchant_knowledge")
      .select("id,type,content,metadata,created_at,updated_at")
      .eq("store_id", storeId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error)
      throw new AppError("NETWORK_ERROR", "Knowledge base unavailable", 503);
    return Response.json({ items: data ?? [] });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "merchant-knowledge", 30, 3600);
    const storeId = await authorizedStore(user.id);
    const input = knowledgeSchema.parse(await request.json());
    return Response.json(await addKnowledge({ storeId, ...input }), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: {
            code: "INVALID_KNOWLEDGE",
            message: error.issues[0].message,
          },
        },
        { status: 400 },
      );
    }
    return safeErrorResponse(error);
  }
}

async function authorizedStore(userId: string) {
  const connection = await getConnectionForUser(userId);
  if (!connection || connection.status !== "connected") {
    throw new AppError("CONNECTION_NOT_FOUND", "Connect Shopify first", 409);
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error || !data) {
    throw new AppError("CONFIGURATION_REQUIRED", "Sync the store first", 409);
  }
  return data.id as string;
}
