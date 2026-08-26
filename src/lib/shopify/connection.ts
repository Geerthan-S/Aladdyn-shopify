import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  decryptTokenBundle,
  encryptTokenBundle,
} from "@/lib/shopify/encryption";
import { AppError } from "@/lib/shopify/errors";
import { refreshOfflineToken } from "@/lib/shopify/oauth";
import { TOKEN_REFRESH_SKEW_SECONDS } from "@/lib/shopify/constants";

export type ConnectionRecord = {
  id: string;
  user_id: string;
  shop_domain: string;
  shopify_shop_id: string | null;
  shop_name: string | null;
  status: string;
  api_version: string;
  granted_scopes: string[];
  installed_at: string | null;
  verified_at: string | null;
  disconnected_at: string | null;
};

type SecretRecord = {
  token_ciphertext: string;
  token_iv: string;
  token_auth_tag: string;
  key_version: number;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
};

export async function getConnectionForUser(userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("shopify_connections")
    .select(
      "id,user_id,shop_domain,shopify_shop_id,shop_name,status,api_version,granted_scopes,installed_at,verified_at,disconnected_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new AppError(
      "NETWORK_ERROR",
      "Unable to read the Shopify connection",
      503,
    );
  return data as ConnectionRecord | null;
}

export async function assertShopAvailable(shopDomain: string, userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("shopify_connections")
    .select("user_id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();
  if (error)
    throw new AppError(
      "NETWORK_ERROR",
      "Unable to verify store ownership",
      503,
    );
  if (data && data.user_id !== userId) {
    throw new AppError(
      "OWNERSHIP_CONFLICT",
      "This Shopify store is already linked to another Aladdyn account",
      409,
    );
  }
}

export async function getFreshAccessToken(connection: ConnectionRecord) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("shopify_connection_secrets")
    .select(
      "token_ciphertext,token_iv,token_auth_tag,key_version,access_token_expires_at,refresh_token_expires_at",
    )
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(
      "TOKEN_REVOKED",
      "Reconnect Shopify to restore access",
      401,
    );
  }

  const secret = data as SecretRecord;
  const bundle = decryptTokenBundle({
    ciphertext: secret.token_ciphertext,
    iv: secret.token_iv,
    authTag: secret.token_auth_tag,
    keyVersion: secret.key_version,
  });
  const refreshAt =
    Date.parse(secret.access_token_expires_at) -
    TOKEN_REFRESH_SKEW_SECONDS * 1000;
  if (Date.now() < refreshAt) return bundle.accessToken;

  if (Date.now() >= Date.parse(secret.refresh_token_expires_at)) {
    await markNeedsReauthorization(connection.id, "Refresh token expired");
    throw new AppError(
      "TOKEN_REVOKED",
      "Reconnect Shopify to restore access",
      401,
    );
  }

  try {
    const refreshed = await refreshOfflineToken(
      connection.shop_domain,
      bundle.refreshToken,
    );
    const encrypted = encryptTokenBundle({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
    });
    const now = Date.now();
    const { error: updateError } = await admin
      .from("shopify_connection_secrets")
      .update({
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
        access_token_expires_at: new Date(
          now + refreshed.expires_in * 1000,
        ).toISOString(),
        refresh_token_expires_at: new Date(
          now + refreshed.refresh_token_expires_in * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("connection_id", connection.id);
    if (updateError) throw updateError;
    return refreshed.access_token;
  } catch {
    await markNeedsReauthorization(connection.id, "Token refresh failed");
    throw new AppError(
      "TOKEN_REVOKED",
      "Reconnect Shopify to restore access",
      401,
    );
  }
}

export async function markNeedsReauthorization(
  connectionId: string,
  reason: string,
) {
  const admin = createAdminSupabase();
  await admin
    .from("shopify_connections")
    .update({
      status: "needs_reauthorization",
      last_error_code: "TOKEN_REVOKED",
      last_error_message: reason.slice(0, 200),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}
