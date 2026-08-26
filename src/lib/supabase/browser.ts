"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function createBrowserSupabase() {
  const { url, key } = getSupabasePublicConfig();

  if (!url || !key) {
    throw new Error("Supabase browser configuration is missing");
  }

  return createBrowserClient(url, key);
}
