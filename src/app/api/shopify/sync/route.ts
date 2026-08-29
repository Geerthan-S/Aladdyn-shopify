export const runtime = "nodejs";

import { requireUser } from "@/lib/auth/require-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import { getSyncStatus, syncShopifyStore } from "@/lib/shopify/sync";

async function connected(userId: string) {
  const connection = await getConnectionForUser(userId);
  if (!connection || connection.status !== "connected") {
    throw new AppError(
      "CONNECTION_NOT_FOUND",
      "Connect a Shopify store before syncing",
      409,
    );
  }
  return connection;
}

export async function GET() {
  try {
    const user = await requireUser();
    const connection = await connected(user.id);
    return Response.json(await getSyncStatus(connection.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopify-sync", 4, 300);
    const connection = await connected(user.id);
    return Response.json(await syncShopifyStore(connection), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
