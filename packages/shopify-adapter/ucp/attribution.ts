import type { CartAttribution } from "@commerce-agent/providers/types";

export function createCartAttribution(
  conversationId: string,
  channel = "web_chat",
  campaign?: string | null,
): CartAttribution {
  return {
    utm_source: "aladdyn",
    utm_medium: "conversational_commerce",
    utm_content: channel.slice(0, 100),
    activity_id_tag: "conversation_id",
    activity_id_value: conversationId.slice(0, 120),
    ...(campaign ? { utm_campaign: campaign.slice(0, 100) } : {}),
  };
}
