export const runtime = "nodejs";

import { requireUser } from "@/lib/auth/require-user";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";

export async function POST() {
  try {
    const user = await requireUser();
    const connection = await getConnectionForUser(user.id);
    if (!connection)
      throw new AppError("CONNECTION_NOT_FOUND", "No store is connected", 404);

    const admin = createAdminSupabase();
    const { error: secretError } = await admin
      .from("shopify_connection_secrets")
      .delete()
      .eq("connection_id", connection.id);
    if (secretError)
      throw new AppError(
        "NETWORK_ERROR",
        "Could not remove local token access",
        503,
      );

    const { error: metadataError } = await admin
      .from("shopify_connections")
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("user_id", user.id);
    if (metadataError)
      throw new AppError(
        "NETWORK_ERROR",
        "Connection cleanup was incomplete",
        503,
      );

    return Response.json({
      disconnected: true,
      shopifyRevocation: "merchant_uninstall_required",
      message:
        "Local credentials were removed. Remove the app in Shopify Admin to revoke Shopify-side access.",
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
