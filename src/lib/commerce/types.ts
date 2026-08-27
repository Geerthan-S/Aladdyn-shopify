export const UCP_VERSION = "2026-04-08" as const;

export type CommerceMoney = {
  amountMinor: number;
  currency: string;
};

export type CommerceImage = {
  url: string;
  altText: string | null;
};

export type CommerceVariant = {
  variantId: string;
  title: string;
  sku: string | null;
  price: CommerceMoney;
  available: boolean;
  options: Array<{ name: string; value: string }>;
  image: CommerceImage | null;
};

export type CommerceProduct = {
  provider: "shopify";
  merchant: string;
  productId: string;
  title: string;
  description: string;
  handle: string | null;
  url: string | null;
  vendor: string | null;
  productType: string | null;
  images: CommerceImage[];
  variants: CommerceVariant[];
  price: CommerceMoney;
  availability: "available" | "unavailable" | "unknown";
  metadata: Record<string, string | number | boolean | null>;
};

export type CartLineState = {
  variantId: string;
  quantity: number;
};

export type CartAttribution = {
  utm_source: "aladdyn";
  utm_medium: "conversational_commerce";
  utm_content: string;
  activity_id_tag: "conversation_id";
  activity_id_value: string;
  utm_campaign?: string;
};

export type AuthoritativeCartState = {
  lineItems: CartLineState[];
  context: {
    currency?: string;
    address_country?: string;
  };
  attribution: CartAttribution;
};

export type CommerceCartLine = CartLineState & {
  lineId: string | null;
  title: string;
  price: CommerceMoney | null;
  imageUrl: string | null;
};

export type CommerceCart = {
  provider: "shopify";
  merchant: string;
  cartId: string;
  version: number;
  lines: CommerceCartLine[];
  totals: Array<{ type: string; money: CommerceMoney; label: string }>;
  currency: string;
  continueUrl: string | null;
  attribution: CartAttribution;
};

export type CommerceCheckout = {
  provider: "shopify";
  merchant: string;
  checkoutId: string;
  cartId: string;
  status:
    | "incomplete"
    | "requires_escalation"
    | "ready_for_complete"
    | "completed"
    | "cancelled"
    | "unknown";
  continueUrl: string;
  totals: Array<{ type: string; money: CommerceMoney; label: string }>;
};

export type ProviderCapabilities = {
  provider: "shopify";
  version: typeof UCP_VERSION;
  catalog: { search: boolean; lookup: boolean; product: boolean };
  cart: { supported: boolean; semantics: "replace" };
  checkout: {
    supported: boolean;
    mode: "handoff";
    directCompletion: false;
  };
  orders: { supported: false };
  mcpEndpoint: string;
  discoveryUrl: string;
};

export type CommerceSession = {
  id: string;
  userId: string;
  conversationId: string;
  provider: "shopify";
  storeDomain: string;
  ucpVersion: typeof UCP_VERSION;
  mcpEndpoint: string;
  cartId: string | null;
  cartState: AuthoritativeCartState;
  cartVersion: number;
  checkoutId: string | null;
  checkoutStatus: string | null;
  continueUrl: string | null;
  lastProducts: CommerceProduct[];
  lastVariantId: string | null;
};

export type GenieToolName =
  | "search_products"
  | "get_product"
  | "view_cart"
  | "add_to_cart"
  | "remove_from_cart"
  | "change_quantity"
  | "checkout"
  | "get_checkout_status";

export type GenieResponse = {
  conversationId: string;
  message: string;
  tool: GenieToolName | null;
  products?: CommerceProduct[];
  cart?: CommerceCart;
  checkout?: CommerceCheckout;
};
