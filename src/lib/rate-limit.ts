import "server-only";

import { createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AppError } from "@/lib/shopify/errors";

export async function enforceRateLimit(
  subject: string,
  action: string,
  limit: number,
  windowSeconds: number,
) {
  const bucket = createHash("sha256")
    .update(`${action}:${subject}`)
    .digest("hex");
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("check_connector_rate_limit", {
    p_bucket_key: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error)
    throw new AppError("NETWORK_ERROR", "Rate limit service unavailable", 503);
  if (!data)
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
      429,
    );
}
