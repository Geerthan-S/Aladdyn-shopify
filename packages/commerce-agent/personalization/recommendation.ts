import type { ProductSearchInput } from "@commerce-agent/providers/product-provider";
import type { CustomerProfile } from "@commerce-agent/personalization/types";

export function buildRecommendationQuery(
  request: string,
  profile: CustomerProfile,
  defaults: { currency?: string; country?: string; limit?: number } = {},
): ProductSearchInput {
  const signals = [
    request.trim(),
    ...profile.preferredCategories.slice(0, 2),
    ...profile.preferredColors.slice(0, 2),
  ].filter(Boolean);
  return {
    query: [...new Set(signals)].join(" ").slice(0, 300),
    ...(profile.budgetMax !== null
      ? { maxPrice: profile.budgetMax, currency: defaults.currency }
      : {}),
    ...(defaults.country ? { country: defaults.country } : {}),
    limit: defaults.limit ?? 6,
  };
}
