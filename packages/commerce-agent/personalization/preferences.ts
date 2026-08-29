import type { ShoppingEvent } from "@commerce-agent/personalization/types";

export function buildPreferenceProfile(events: ShoppingEvent[]) {
  const categories = scores(events, "category");
  const colors = scores(events, "color");
  const dislikedProductIds = new Set(
    events
      .filter((event) => event.eventType === "PRODUCT_DISLIKE")
      .map((event) => stringValue(event.metadata.productId))
      .filter(Boolean),
  );
  const purchases = events
    .filter((event) => event.eventType === "PURCHASE")
    .map((event) => stringValue(event.metadata.productTitle))
    .filter(Boolean)
    .slice(0, 10);
  const prices = events
    .map((event) => numberValue(event.metadata.price))
    .filter((value): value is number => value !== null && value >= 0);
  return {
    preferredCategories: top(categories, 5),
    preferredColors: top(colors, 5),
    previousPurchases: [...new Set(purchases)],
    dislikedProductIds: [...dislikedProductIds],
    budget:
      prices.length > 0
        ? {
            min: Math.min(...prices),
            max: Math.max(...prices),
            median: [...prices].sort((a, b) => a - b)[
              Math.floor(prices.length / 2)
            ],
          }
        : null,
    eventCount: events.length,
  };
}

function scores(events: ShoppingEvent[], field: "category" | "color") {
  const result = new Map<string, number>();
  for (const event of events) {
    const value = stringValue(event.metadata[field]);
    if (!value) continue;
    const weight =
      event.eventType === "PURCHASE"
        ? 5
        : event.eventType === "ADD_CART"
          ? 3
          : event.eventType === "PRODUCT_DISLIKE"
            ? -4
            : 1;
    result.set(value, (result.get(value) ?? 0) + weight);
  }
  return result;
}

function top(values: Map<string, number>, limit: number) {
  return [...values.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
