export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError } from "@/lib/shopify/errors";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  hashOAuthState,
} from "@/lib/shopify/oauth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "shopify-reconnect", 10, 600);
    const connection = await getConnectionForUser(user.id);
    if (!connection)
      throw new AppError("CONNECTION_NOT_FOUND", "Connect a store first", 404);

    const state = generateOAuthState();
    const env = getServerEnv();
    const admin = createAdminSupabase();
    const { error } = await admin.from("shopify_oauth_states").insert({
      state_hash: hashOAuthState(state),
      user_id: user.id,
      shop_domain: connection.shop_domain,
      redirect_path: "/dashboard",
      expires_at: new Date(
        Date.now() + env.OAUTH_STATE_TTL_SECONDS * 1000,
      ).toISOString(),
    });
    if (error)
      throw new AppError(
        "NETWORK_ERROR",
        "Could not restart Shopify authorization",
        503,
      );
    return NextResponse.redirect(
      buildAuthorizationUrl(connection.shop_domain, state),
      303,
    );
  } catch (error) {
    const code = error instanceof AppError ? error.code : "NETWORK_ERROR";
    const target = new URL("/connect", request.url);
    target.searchParams.set("error", code);
    return NextResponse.redirect(target, 303);
  }
}
