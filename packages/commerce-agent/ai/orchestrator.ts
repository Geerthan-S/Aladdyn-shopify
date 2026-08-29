import type {
  AIProvider,
  AiCompletion,
  AiMessage,
  AiRequest,
  AiTool,
  AiToolCall,
} from "@commerce-agent/providers/ai-provider";

export type AIToolExecution<T> = {
  value: T;
  content: string;
};

export async function runAIToolLoop<T>(input: {
  provider: AIProvider;
  messages: AiMessage[];
  tools: AiTool[];
  executeTool: (call: AiToolCall, round: number) => Promise<AIToolExecution<T>>;
  onToolResult?: (
    call: AiToolCall,
    result: AIToolExecution<T>,
    round: number,
  ) => Promise<void> | void;
  onTextDelta?: (text: string) => void;
  maxRounds?: number;
  maxTokens?: number;
}) {
  let lastToolResult: T | null = null;
  let model = "";
  for (let round = 0; round < (input.maxRounds ?? 5); round += 1) {
    const request: AiRequest = {
      purpose: "chat",
      messages: input.messages,
      tools: input.tools,
      maxTokens: input.maxTokens ?? 900,
    };
    const completion = input.onTextDelta
      ? await completeStreaming(input.provider, request, input.onTextDelta)
      : await input.provider.complete(request);
    model = completion.model;
    if (!completion.toolCalls.length) {
      return { content: completion.content, lastToolResult, model };
    }

    input.messages.push({
      role: "assistant",
      content: completion.content || null,
      tool_calls: completion.toolCalls,
    });
    for (const call of completion.toolCalls) {
      const result = await input.executeTool(call, round);
      lastToolResult = result.value;
      input.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
      await input.onToolResult?.(call, result, round);
    }
  }
  return { content: "", lastToolResult, model };
}

async function completeStreaming(
  provider: AIProvider,
  request: AiRequest,
  onTextDelta: (text: string) => void,
): Promise<AiCompletion> {
  let content = "";
  let model = "";
  const calls = new Map<number, AiToolCall>();
  for await (const event of provider.stream(request)) {
    if (event.type === "text_delta") {
      content += event.text;
      onTextDelta(event.text);
    } else if (event.type === "tool_call_delta") {
      const index = event.toolCall.index ?? 0;
      const current = calls.get(index) ?? {
        id: "",
        type: "function" as const,
        function: { name: "", arguments: "" },
      };
      current.id = event.toolCall.id ?? current.id;
      current.function.name =
        event.toolCall.function?.name ?? current.function.name;
      current.function.arguments += event.toolCall.function?.arguments ?? "";
      calls.set(index, current);
    } else {
      model = event.model;
    }
  }
  return {
    content: content.trim(),
    toolCalls: [...calls.values()].filter(
      (call) => call.id && call.function.name,
    ),
    model,
  };
}
