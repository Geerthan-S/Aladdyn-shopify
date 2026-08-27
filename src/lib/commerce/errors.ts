export type CommerceErrorCode =
  | "CAPABILITY_UNAVAILABLE"
  | "DISCOVERY_INVALID"
  | "AGENT_AUTH_FAILED"
  | "MCP_ERROR"
  | "MCP_TIMEOUT"
  | "COMMERCE_THROTTLED"
  | "CART_CONFLICT"
  | "CART_EMPTY"
  | "VARIANT_UNAVAILABLE"
  | "CHECKOUT_UNAVAILABLE"
  | "INVALID_COMMERCE_INPUT"
  | "UNSAFE_CHECKOUT_URL";

export class CommerceError extends Error {
  constructor(
    public readonly code: CommerceErrorCode,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly requestId = crypto.randomUUID(),
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

export function commerceUserMessage(error: unknown) {
  if (!(error instanceof CommerceError)) {
    return "I couldn't reach the store right now. Please try again.";
  }
  switch (error.code) {
    case "VARIANT_UNAVAILABLE":
      return "That option is no longer available. Want me to show the available choices?";
    case "CART_CONFLICT":
      return "Your cart changed while I was updating it. I've refreshed it—please try once more.";
    case "COMMERCE_THROTTLED":
      return "Shopify is responding slowly right now. Please try that again shortly.";
    case "CHECKOUT_UNAVAILABLE":
    case "AGENT_AUTH_FAILED":
      return "I couldn't create checkout right now, but your cart is still saved.";
    case "CART_EMPTY":
      return "Your cart is empty. Add a product before checking out.";
    case "CAPABILITY_UNAVAILABLE":
      return "That store doesn't currently support this shopping action.";
    case "INVALID_COMMERCE_INPUT":
      return error.message;
    default:
      return "I couldn't reach the store catalog right now. Please try again.";
  }
}
