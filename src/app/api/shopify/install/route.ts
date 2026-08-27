export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { assertShopAvailable } from "@/lib/shopify/connection";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { AppError } from "@/lib/shopify/errors";
import { verifyOAuthHmac } from "@/lib/shopify/hmac";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  hashOAuthState,
} from "@/lib/shopify/oauth";
import { OAUTH_CALLBACK_MAX_AGE_SECONDS } from "@/lib/shopify/constants";
import {
  getServerEnv,
  getShopifyAppStoreUrl,
  getShopifyTestStoreDomain,
} from "@/lib/env";

function errorRedirect(request: Request, error: unknown) {
  const code = error instanceof AppError ? error.code : "NETWORK_ERROR";
  const target = new URL("/connect", request.url);
  target.searchParams.set("error", code);
  return NextResponse.redirect(target, 303);
}

async function beginAuthorization(
  request: Request,
  user: { id: string },
  shopInput: string,
) {
  try {
    await enforceRateLimit(user.id, "shopify-install", 10, 600);
    let shop: string;
    try {
      shop = normalizeShopDomain(shopInput);
    } catch {
      throw new AppError(
        "INVALID_SHOP",
        "Shopify supplied an invalid store domain",
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
      redirect_path: "/dashboard?connected=1",
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
    return NextResponse.redirect(authorizationUrl, 303);
  } catch (error) {
    return errorRedirect(request, error);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      await enforceRateLimit(user.id, "shopify-app-store", 20, 600);
      const listing = getShopifyAppStoreUrl();
      if (listing) {
        return NextResponse.redirect(listing, 303);
      }

      const testShop = getShopifyTestStoreDomain();
      if (testShop) {
        return beginAuthorization(request, user, testShop);
      }

      throw new AppError(
        "CONFIGURATION_REQUIRED",
        "The Shopify App Store listing or test store is not configured",
        503,
      );
    }

    const env = getServerEnv();
    if (!verifyOAuthHmac(url.searchParams, env.SHOPIFY_API_SECRET)) {
      throw new AppError(
        "OAUTH_INVALID",
        "Invalid Shopify installation signature",
        401,
      );
    }
    const timestamp = Number(url.searchParams.get("timestamp"));
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > OAUTH_CALLBACK_MAX_AGE_SECONDS
    ) {
      throw new AppError("OAUTH_EXPIRED", "The Shopify request expired", 400);
    }

    return beginAuthorization(request, user, shop);
  } catch (error) {
    return errorRedirect(request, error);
  }
}
