import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/shopify/errors";

export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new AppError("AUTH_REQUIRED", "Log in to continue", 401);
  }
  return data.user;
}
