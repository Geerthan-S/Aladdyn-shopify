import "server-only";
export * from "@commerce-agent/providers/ai-provider";
import type { AIProvider } from "@commerce-agent/providers/ai-provider";

export async function getAiProvider(): Promise<AIProvider> {
  const { OpenRouterProvider } = await import("@/lib/ai/openrouter");
  return new OpenRouterProvider();
}
