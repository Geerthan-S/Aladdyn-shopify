import "server-only";

import { AppError } from "@/lib/shopify/errors";
import type {
  AiCompletion,
  AiMessage,
  AiProvider,
  AiRequest,
  AiStreamEvent,
  JsonSchemaFormat,
} from "@/lib/ai/provider";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: AiCompletion["toolCalls"];
    };
  }>;
  error?: { message?: string };
};

export class OpenRouterProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly chatModel: string;
  private readonly fastModel: string;

  constructor() {
    this.apiKey = requireEnv("OPENROUTER_API_KEY");
    this.chatModel = requireEnv("CHAT_MODEL");
    this.fastModel = requireEnv("FAST_MODEL");
  }

  async complete(request: AiRequest): Promise<AiCompletion> {
    const response = await this.request({
      model: this.modelFor(request.purpose),
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.tools?.length ? "auto" : undefined,
      parallel_tool_calls: false,
      max_tokens: request.maxTokens ?? 900,
      temperature: 0.25,
    });
    const payload = (await response.json()) as OpenRouterResponse;
    const message = payload.choices?.[0]?.message;
    if (!message) throw providerError(payload.error?.message);
    return {
      content: message.content?.trim() ?? "",
      toolCalls: message.tool_calls ?? [],
      model: payload.model ?? this.modelFor(request.purpose),
    };
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamEvent> {
    const requestedModel = this.modelFor(request.purpose);
    const response = await this.request({
      model: requestedModel,
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.tools?.length ? "auto" : undefined,
      parallel_tool_calls: false,
      max_tokens: request.maxTokens ?? 900,
      temperature: 0.25,
      stream: true,
    });
    if (!response.body) throw providerError("OpenRouter returned no stream");

    let buffer = "";
    let model = requestedModel;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data) as {
          model?: string;
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                type?: "function";
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        model = event.model ?? model;
        const delta = event.choices?.[0]?.delta;
        if (delta?.content) yield { type: "text_delta", text: delta.content };
        for (const toolCall of delta?.tool_calls ?? []) {
          yield { type: "tool_call_delta", toolCall };
        }
      }
    }
    yield { type: "done", model };
  }

  async structured<T>(input: {
    purpose: "chat" | "fast";
    messages: AiMessage[];
    format: JsonSchemaFormat;
  }): Promise<T> {
    const response = await this.request({
      model: this.modelFor(input.purpose),
      messages: input.messages,
      temperature: 0,
      provider: { require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: { ...input.format, strict: true },
      },
    });
    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw providerError(payload.error?.message);
    try {
      return JSON.parse(content) as T;
    } catch {
      throw providerError("OpenRouter returned invalid structured JSON");
    }
  }

  private modelFor(purpose: "chat" | "fast") {
    return purpose === "fast" ? this.fastModel : this.chatModel;
  }

  private async request(body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "",
          "X-Title": "Aladdyn Shopify AI Commerce Prototype",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
    } catch {
      throw providerError("OpenRouter could not be reached", 503);
    }
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") ?? undefined;
      console.error("ai.provider.request_failed", {
        provider: "openrouter",
        status: response.status,
        requestId,
      });
      throw providerError(
        response.status === 429
          ? "The AI provider is busy. Please retry shortly."
          : "The AI assistant is temporarily unavailable.",
        response.status === 429 ? 429 : 502,
      );
    }
    return response;
  }
}

function requireEnv(name: "OPENROUTER_API_KEY" | "CHAT_MODEL" | "FAST_MODEL") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(
      "CONFIGURATION_REQUIRED",
      `${name} is required for the AI commerce assistant`,
      503,
    );
  }
  return value;
}

function providerError(message?: string, status = 502) {
  return new AppError(
    "NETWORK_ERROR",
    message?.slice(0, 180) || "The AI assistant is temporarily unavailable.",
    status,
  );
}
