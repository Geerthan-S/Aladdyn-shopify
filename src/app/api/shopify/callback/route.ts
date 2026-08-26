export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { OAUTH_CALLBACK_MAX_AGE_SECONDS } from "@/lib/shopify/constants";
import { normalizeShopDomain } from "@/lib/shopify/domain";
import { encryptTokenBundle } from "@/lib/shopify/encryption";
import { AppError } from "@/lib/shopify/errors";
import { verifyOAuthHmac } from "@/lib/shopify/hmac";
import { exchangeAuthorizationCode, hashOAuthState } from "@/lib/shopify/oauth";
import { compareScopes, parseScopes } from "@/lib/shopify/scopes";
import { shopifyGraphQLWithAccessToken } from "@/lib/shopify/admin-graphql";

const VERIFY_QUERY = `query VerifyInstallation { shop { id name myshopifyDomain } appInstallation { accessScopes { handle } } }`;

function safeRedirect(code: string) {
  const url = new URL("/connect", getServerEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request) {
  let popupFlow = false;
  try {
    const env = getServerEnv();
    const url = new URL(request.url);
    const params = url.searchParams;
    const shop = normalizeShopDomain(params.get("shop") ?? "");

    if (!verifyOAuthHmac(params, env.SHOPIFY_API_SECRET)) {
      throw new AppError(
        "OAUTH_INVALID",
        "Invalid Shopify callback signature",
        401,
      );
    }

    const timestamp = Number(params.get("timestamp"));
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > OAUTH_CALLBACK_MAX_AGE_SECONDS
    ) {
      throw new AppError("OAUTH_EXPIRED", "The Shopify callback expired", 400);
    }

    const state = params.get("state");
    const code = params.get("code");
    if (!state || !code || state.length > 512 || code.length > 2048) {
      throw new AppError(
        "OAUTH_INVALID",
        "The Shopify callback is incomplete",
        400,
      );
    }

    const admin = createAdminSupabase();
    const { data: consumed, error: stateError } = await admin.rpc(
      "consume_shopify_oauth_state",
      { p_state_hash: hashOAuthState(state), p_shop_domain: shop },
    );
    if (stateError || !consumed?.length) {
      throw new AppError(
        "OAUTH_EXPIRED",
        "The authorization request expired or was already used",
        400,
      );
    }

    const userId = consumed[0].user_id as string;
    popupFlow = consumed[0].redirect_path === "/shopify/complete";
    const token = await exchangeAuthorizationCode(shop, code);
    const verified = await shopifyGraphQLWithAccessToken<{
      shop: { id: string; name: string; myshopifyDomain: string };
      appInstallation: { accessScopes: { handle: string }[] };
    }>(shop, token.access_token, VERIFY_QUERY);

    const canonicalShop = normalizeShopDomain(
      verified.data.shop.myshopifyDomain,
    );
    if (canonicalShop !== shop) {
      throw new AppError(
        "OAUTH_INVALID",
        "Shopify returned an unexpected store",
        400,
      );
    }

    const grantedScopes = parseScopes(
      verified.data.appInstallation.accessScopes.map((scope) => scope.handle),
    );
    const comparison = compareScopes(
      parseScopes(env.SHOPIFY_SCOPES),
      grantedScopes,
    );
    const encrypted = encryptTokenBundle({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const now = Date.now();
    const { error: persistError } = await admin.rpc(
      "persist_shopify_connection",
      {
        p_user_id: userId,
        p_shop_domain: canonicalShop,
        p_shopify_shop_id: verified.data.shop.id,
        p_shop_name: verified.data.shop.name,
        p_status: comparison.needsReauthorization
          ? "needs_reauthorization"
          : "connected",
        p_granted_scopes: grantedScopes,
        p_token_ciphertext: encrypted.ciphertext,
        p_token_iv: encrypted.iv,
        p_token_auth_tag: encrypted.authTag,
        p_key_version: encrypted.keyVersion,
        p_access_token_expires_at: new Date(
          now + token.expires_in * 1000,
        ).toISOString(),
        p_refresh_token_expires_at: new Date(
          now + token.refresh_token_expires_in * 1000,
        ).toISOString(),
      },
    );
    if (persistError) {
      if (persistError.message.includes("SHOP_OWNERSHIP_CONFLICT")) {
        throw new AppError(
          "OWNERSHIP_CONFLICT",
          "This store belongs to another account",
          409,
        );
      }
      throw new AppError(
        "NETWORK_ERROR",
        "Could not save the Shopify connection",
        503,
      );
    }

    const destination = popupFlow
      ? "/shopify/complete"
      : "/dashboard?connected=1";
    return NextResponse.redirect(
      new URL(destination, env.NEXT_PUBLIC_APP_URL),
      303,
    );
  } catch (error) {
    const code = error instanceof AppError ? error.code : "NETWORK_ERROR";
    console.error("Shopify callback failed", { code });
    if (popupFlow) {
      const target = new URL(
        "/shopify/complete",
        getServerEnv().NEXT_PUBLIC_APP_URL,
      );
      target.searchParams.set("error", code);
      return NextResponse.redirect(target, 303);
    }
    return safeRedirect(code);
  }
}
