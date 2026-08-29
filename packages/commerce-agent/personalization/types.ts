export type CustomerProfile = {
  preferredCategories: string[];
  preferredColors: string[];
  preferredSizes: string[];
  budgetMin: number | null;
  budgetMax: number | null;
};

export const SHOPPING_EVENT_TYPES = [
  "PRODUCT_VIEW",
  "SEARCH",
  "PRODUCT_CLICK",
  "ADD_CART",
  "REMOVE_CART",
  "PURCHASE",
  "PRODUCT_DISLIKE",
] as const;

export type ShoppingEventType = (typeof SHOPPING_EVENT_TYPES)[number];

export type ShoppingEvent = {
  id: string;
  eventType: ShoppingEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
};
