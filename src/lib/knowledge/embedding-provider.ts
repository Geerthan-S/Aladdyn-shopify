import "server-only";

export type EmbeddingInputType = "search_document" | "search_query";

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  const { OpenRouterEmbeddingProvider } =
    await import("@/lib/knowledge/openrouter-embeddings");
  return new OpenRouterEmbeddingProvider();
}

export function isEmbeddingConfigured() {
  return Boolean(
    process.env.OPENROUTER_API_KEY?.trim() &&
    process.env.EMBEDDING_MODEL?.trim() &&
    process.env.EMBEDDING_DIMENSIONS?.trim(),
  );
}
