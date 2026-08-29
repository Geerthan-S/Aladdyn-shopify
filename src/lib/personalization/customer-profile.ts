import "server-only";

import { getAiProvider } from "@/lib/ai/provider";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { CustomerProfile } from "@commerce-agent/personalization/types";
export type { CustomerProfile } from "@commerce-agent/personalization/types";

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    preferredCategories: { type: "array", items: { type: "string" } },
    preferredColors: { type: "array", items: { type: "string" } },
    preferredSizes: { type: "array", items: { type: "string" } },
    budgetMin: { anyOf: [{ type: "number" }, { type: "null" }] },
    budgetMax: { anyOf: [{ type: "number" }, { type: "null" }] },
  },
  required: [
    "preferredCategories",
    "preferredColors",
    "preferredSizes",
    "budgetMin",
    "budgetMax",
  ],
  additionalProperties: false,
};

export async function updateCustomerProfile(input: {
  storeId: string;
  customerKey: string;
  current: CustomerProfile;
  recentConversation: string;
}) {
  try {
    const provider = await getAiProvider();
    const profile = await provider.structured<CustomerProfile>({
      purpose: "fast",
      messages: [
        {
          role: "system",
          content:
            "Extract only explicit shopping preferences. Preserve existing preferences unless the shopper corrects them. Never infer sensitive traits or invent purchase history.",
        },
        {
          role: "user",
          content: JSON.stringify({
            currentProfile: input.current,
            conversation: input.recentConversation.slice(-6_000),
          }),
        },
      ],
      format: {
        name: "customer_preference_profile",
        description: "Non-sensitive, explicitly stated shopping preferences",
        schema: PROFILE_SCHEMA,
      },
    });
    const clean = sanitizeProfile(profile);
    const admin = createAdminSupabase();
    await admin.from("customer_profiles").upsert(
      {
        store_id: input.storeId,
        customer_key: input.customerKey,
        preferred_categories: clean.preferredCategories,
        preferred_colors: clean.preferredColors,
        preferred_sizes: clean.preferredSizes,
        budget_min: clean.budgetMin,
        budget_max: clean.budgetMax,
        profile_json: clean,
        source: "conversation",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,customer_key" },
    );
  } catch (error) {
    console.warn("personalization.profile_update_skipped", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

function sanitizeProfile(profile: CustomerProfile): CustomerProfile {
  const strings = (values: unknown) =>
    Array.isArray(values)
      ? [
          ...new Set(
            values
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ].slice(0, 20)
      : [];
  const money = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return {
    preferredCategories: strings(profile.preferredCategories),
    preferredColors: strings(profile.preferredColors),
    preferredSizes: strings(profile.preferredSizes),
    budgetMin: money(profile.budgetMin),
    budgetMax: money(profile.budgetMax),
  };
}
