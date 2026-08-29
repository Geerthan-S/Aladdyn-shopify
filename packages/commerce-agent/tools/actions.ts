export type ExplicitAction =
  | { tool: "search_products"; input: Record<string, unknown> }
  | { tool: "recommend_products"; input: Record<string, unknown> }
  | { tool: "get_product"; input: { productId: string } }
  | { tool: "view_cart"; input: Record<string, never> }
  | { tool: "add_to_cart"; input: { variantId: string; quantity: number } }
  | { tool: "remove_from_cart"; input: { variantId: string } }
  | { tool: "change_quantity"; input: { variantId: string; quantity: number } }
  | { tool: "checkout"; input: Record<string, never> }
  | { tool: "get_checkout_status"; input: Record<string, never> };
