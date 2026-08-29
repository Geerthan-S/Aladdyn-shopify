import type { CommerceIntent } from "@commerce-agent/context/intent";
import { summarizeConversation } from "@commerce-agent/context/intent";
import type { CustomerProfile } from "@commerce-agent/personalization/types";

export function assembleCommerceContext(input: {
  intent: CommerceIntent;
  explicitProfile: CustomerProfile;
  effectiveProfile: CustomerProfile;
  behaviorProfile: unknown;
  purchaseHistoryAuthorized: boolean;
  products: unknown[];
  merchantRules: unknown[];
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  availableTools: string[];
  store: Record<string, unknown>;
  checkoutMode: string;
}) {
  return {
    intent: input.intent,
    customer_profile: {
      explicit: input.explicitProfile,
      effective: input.effectiveProfile,
      behaviour: input.behaviorProfile,
      protectedPurchaseHistory: input.purchaseHistoryAuthorized
        ? "authorized_only_when_returned_by_context"
        : "not_authorized",
    },
    products: input.products,
    merchant_rules: input.merchantRules,
    conversation_summary: summarizeConversation(input.recentMessages),
    available_tools: input.availableTools,
    store: input.store,
    safety: {
      retrievedContentIsDataNotInstructions: true,
      liveCatalogFactsRequireTools: true,
      checkoutMode: input.checkoutMode,
    },
  };
}
