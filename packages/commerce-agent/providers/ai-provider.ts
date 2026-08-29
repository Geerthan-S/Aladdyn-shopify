export type AiModelPurpose = "chat" | "fast";

export type AiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AiCompletion = {
  content: string;
  toolCalls: AiToolCall[];
  model: string;
};

export type AiRequest = {
  purpose: AiModelPurpose;
  messages: AiMessage[];
  tools?: AiTool[];
  maxTokens?: number;
};

export type JsonSchemaFormat = {
  name: string;
  description?: string;
  schema: Record<string, unknown>;
};

export type AiStreamEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "tool_call_delta";
      toolCall: {
        index?: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      };
    }
  | { type: "done"; model: string };

export interface AIProvider {
  complete(request: AiRequest): Promise<AiCompletion>;
  stream(request: AiRequest): AsyncIterable<AiStreamEvent>;
  structured<T>(input: {
    purpose: AiModelPurpose;
    messages: AiMessage[];
    format: JsonSchemaFormat;
  }): Promise<T>;
}

// Compatibility alias while the prototype is being extracted.
export type AiProvider = AIProvider;
