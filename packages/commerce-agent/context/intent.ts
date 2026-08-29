export type CommerceIntent =
  | "product_search"
  | "recommendation"
  | "product_details"
  | "merchant_policy"
  | "cart"
  | "checkout"
  | "general";

export function detectCommerceIntent(message: string): CommerceIntent {
  const value = message.toLowerCase();
  if (/\b(checkout|check out|buy now|pay now)\b/.test(value)) return "checkout";
  if (/\b(cart|add|remove|quantity)\b/.test(value)) return "cart";
  if (
    /\b(return|refund|shipping|delivery|payment|policy|warranty|exchange)\b/.test(
      value,
    )
  ) {
    return "merchant_policy";
  }
  if (
    /\b(recommend|suggest|suit me|for me|bought|usually prefer)\b/.test(value)
  ) {
    return "recommendation";
  }
  if (/\b(details?|compare|difference|variant|size|color)\b/.test(value)) {
    return "product_details";
  }
  if (/\b(show|find|search|looking for|need|under|budget)\b/.test(value)) {
    return "product_search";
  }
  return "general";
}

export function summarizeConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 300)}`)
    .join("\n")
    .slice(0, 2_500);
}
