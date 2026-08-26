export const runtime = "nodejs";

import { requireUser } from "@/lib/auth/require-user";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";

export async function POST() {
  try {
    const user = await requireUser();
    const connection = await getConnectionForUser(user.id);
    if (!connection)
      throw new AppError("CONNECTION_NOT_FOUND", "No store is connected", 404);
    const result = await shopifyGraphQL<{
      shop: { id: string; name: string; myshopifyDomain: string };
    }>(
      connection,
      `query VerifyConnection { shop { id name myshopifyDomain } }`,
    );
    if (
      normalizeShopDomain(result.data.shop.myshopifyDomain) !==
      connection.shop_domain
    ) {
      throw new AppError(
        "SHOP_ACCESS_DENIED",
        "The token belongs to a different store",
        403,
      );
    }
    const admin = createAdminSupabase();
    await admin
      .from("shopify_connections")
      .update({
        status: "connected",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("user_id", user.id);
    return Response.json({
      verified: true,
      shop: result.data.shop,
      graphQL: result.graphQL,
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
