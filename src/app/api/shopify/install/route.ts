export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assertShopAvailable } from "@/lib/shopify/connection";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { AppError } from "@/lib/shopify/errors";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  hashOAuthState,
} from "@/lib/shopify/oauth";
import { getServerEnv } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopify-install", 10, 600);
    const form = await request.formData();
    const shop = normalizeShopDomain(String(form.get("shop") ?? ""));
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

    return NextResponse.redirect(buildAuthorizationUrl(shop, state), 303);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "NETWORK_ERROR";
    const target = new URL("/connect", request.url);
    target.searchParams.set("error", code);
    return NextResponse.redirect(target, 303);
  }
}
