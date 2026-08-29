import { describe, expect, it } from "vitest";
import { detectCommerceIntent, summarizeConversation } from "@/lib/ai/intent";

describe("commerce intent and conversation context", () => {
  it.each([
    ["Show me black shirts under 2000", "product_search"],
    ["Recommend something that would suit me", "recommendation"],
    ["Can I return this?", "merchant_policy"],
    ["Add it to my cart", "cart"],
    ["I am ready to checkout", "checkout"],
  ] as const)("classifies %s", (message, expected) => {
    expect(detectCommerceIntent(message)).toBe(expected);
  });

  it("keeps only a compact recent conversation summary", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `message-${index} ${"x".repeat(400)}`,
    }));
    const summary = summarizeConversation(messages);
    expect(summary).not.toContain("message-0");
    expect(summary).toContain("message-11");
    expect(summary.length).toBeLessThanOrEqual(2500);
  });
});
