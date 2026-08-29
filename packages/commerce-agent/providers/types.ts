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
  provider: string;
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
  provider: string;
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
  provider: string;
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
  provider: string;
  version: string;
  catalog: { search: boolean; lookup: boolean; product: boolean };
  cart: { supported: boolean; semantics: "replace" };
  checkout: {
    supported: boolean;
    mode: "handoff";
    directCompletion: false;
  };
  orders: { supported: boolean };
  endpoint?: string;
  discoveryUrl?: string;
  metadata?: Record<string, unknown>;
};

export type CommerceSession = {
  id: string;
  userId: string;
  conversationId: string;
  provider: string;
  storeDomain: string;
  ucpVersion: string;
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
  | "recommend_products"
  | "expand_results"
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
  recommendation?: ProductRecommendation;
  products?: CommerceProduct[];
  cart?: CommerceCart;
  checkout?: CommerceCheckout;
  model?: string;
};

export type ProductDisplayMode = "recommended" | "expanded";

export type ProductRecommendation = {
  primary: CommerceProduct | null;
  alternatives: CommerceProduct[];
  totalMatches: number;
  displayMode: ProductDisplayMode;
};
