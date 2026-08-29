import "server-only";

import { AppError } from "@/lib/shopify/errors";
import type {
  EmbeddingInputType,
  EmbeddingProvider,
} from "@/lib/knowledge/embedding-provider";

const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const DATABASE_DIMENSIONS = 1536;

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;

  constructor() {
    this.apiKey = required("OPENROUTER_API_KEY");
    this.model = required("EMBEDDING_MODEL");
    this.dimensions = Number(required("EMBEDDING_DIMENSIONS"));
    if (this.dimensions !== DATABASE_DIMENSIONS) {
      throw new AppError(
        "CONFIGURATION_REQUIRED",
        `EMBEDDING_DIMENSIONS must be ${DATABASE_DIMENSIONS} for the current database migration`,
        503,
      );
    }
  }

  async embed(texts: string[], inputType: EmbeddingInputType) {
    if (!texts.length) return [];
    if (
      texts.length > 64 ||
      texts.some((text) => !text.trim() || text.length > 20_000)
    ) {
      throw new AppError(
        "CONFIGURATION_REQUIRED",
        "Invalid embedding batch",
        400,
      );
    }
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "",
          "X-Title": "Aladdyn Shopify AI Commerce Prototype",
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
          input_type: inputType,
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } catch {
      throw new AppError(
        "NETWORK_ERROR",
        "The embedding provider could not be reached",
        503,
      );
    }
    if (!response.ok) {
      console.error("embedding.provider.request_failed", {
        provider: "openrouter",
        status: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
      throw new AppError(
        "NETWORK_ERROR",
        "Product retrieval is temporarily unavailable",
        response.status === 429 ? 429 : 502,
      );
    }
    const payload = (await response.json()) as {
      data?: Array<{ index: number; embedding: number[] }>;
    };
    const ordered = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
    if (
      ordered.length !== texts.length ||
      ordered.some((item) => item.embedding.length !== this.dimensions)
    ) {
      throw new AppError(
        "NETWORK_ERROR",
        "The embedding provider returned an invalid response",
        502,
      );
    }
    return ordered.map((item) => item.embedding);
  }
}

function required(
  name: "OPENROUTER_API_KEY" | "EMBEDDING_MODEL" | "EMBEDDING_DIMENSIONS",
) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      `${name} is required for vector retrieval`,
      503,
    );
  }
  return value;
}
