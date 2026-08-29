import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "@/lib/ai/openrouter";

describe("OpenRouter AI provider", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.CHAT_MODEL = "configured-chat-model";
    process.env.FAST_MODEL = "configured-fast-model";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects models from environment variables and normalizes tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        model: "resolved-model",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "search_products", arguments: "{}" },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider();
    const response = await provider.complete({
      purpose: "chat",
      messages: [{ role: "user", content: "Find shirts" }],
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("configured-chat-model");
    expect(response.toolCalls[0].function.name).toBe("search_products");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer test-openrouter-key",
    );
    expect(JSON.stringify(response)).not.toContain("test-openrouter-key");
  });

  it("uses the fast model and JSON Schema for structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '{"color":"black"}' } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenRouterProvider();
    const result = await provider.structured<{ color: string }>({
      purpose: "fast",
      messages: [{ role: "user", content: "black" }],
      format: {
        name: "preference",
        schema: {
          type: "object",
          properties: { color: { type: "string" } },
          required: ["color"],
          additionalProperties: false,
        },
      },
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("configured-fast-model");
    expect(request.response_format.type).toBe("json_schema");
    expect(request.provider.require_parameters).toBe(true);
    expect(result).toEqual({ color: "black" });
  });

  it("parses streamed text and tool-call deltas", async () => {
    const sse = [
      'data: {"model":"configured-chat-model","choices":[{"delta":{"content":"Hi "}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"search_products","arguments":"{\\"query\\":"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"shirts\\"}"}}]}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(sse));
              controller.close();
            },
          }),
        ),
      ),
    );
    const events = [];
    for await (const event of new OpenRouterProvider().stream({
      purpose: "chat",
      messages: [{ role: "user", content: "Find shirts" }],
    })) {
      events.push(event);
    }
    expect(events).toContainEqual({ type: "text_delta", text: "Hi " });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_call_delta",
        toolCall: expect.objectContaining({ index: 0 }),
      }),
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      model: "configured-chat-model",
    });
  });
});
