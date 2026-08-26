export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assertShopAvailable } from "@/lib/shopify/connection";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  hashOAuthState,
} from "@/lib/shopify/oauth";
import { getServerEnv } from "@/lib/env";

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopify-install", 10, 600);
    const form = await request.formData();
    let shop: string;
    try {
      shop = normalizeShopDomain(String(form.get("shop") ?? ""));
    } catch {
      throw new AppError(
        "INVALID_SHOP",
        "Enter a valid myshopify.com store domain",
        400,
      );
    }
    await assertShopAvailable(shop, user.id);

    const state = generateOAuthState();
    const env = getServerEnv();
    const admin = createAdminSupabase();
    const { error } = await admin.from("shopify_oauth_states").insert({
      state_hash: hashOAuthState(state),
      user_id: user.id,
      shop_domain: shop,
      redirect_path: "/shopify/complete",
      expires_at: new Date(
        Date.now() + env.OAUTH_STATE_TTL_SECONDS * 1000,
      ).toISOString(),
    });
    if (error)
      throw new AppError(
        "NETWORK_ERROR",
        "Could not start Shopify authorization",
        503,
      );

    const authorizationUrl = buildAuthorizationUrl(shop, state);
    if (wantsJson) {
      return Response.json(
        { authorizationUrl: authorizationUrl.toString() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.redirect(authorizationUrl, 303);
  } catch (error) {
    if (wantsJson) return safeErrorResponse(error);
    const code = error instanceof AppError ? error.code : "NETWORK_ERROR";
    const target = new URL("/connect", request.url);
    target.searchParams.set("error", code);
    return NextResponse.redirect(target, 303);
  }
}
