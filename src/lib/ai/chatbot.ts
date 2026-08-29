import "server-only";

import { z } from "zod";
import { runAIToolLoop } from "@commerce-agent/ai/orchestrator";
import {
  buildConversationContext,
  saveConversationMessage,
} from "@/lib/ai/context-builder";
import { getAiProvider, type AiMessage, type AiTool } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import type { ExplicitAction } from "@/lib/commerce/tool-router";
import type { GenieResponse } from "@commerce-agent/providers/types";
import { CommerceError } from "@commerce-agent/tools/errors";
import {
  updateCustomerProfile,
  type CustomerProfile,
} from "@/lib/personalization/customer-profile";
import { buildRecommendationQuery } from "@/lib/personalization/recommendation-engine";
import type { ConnectionRecord } from "@/lib/shopify/connection";
import { executePermittedTool } from "@/lib/tools/router";

const tools: AiTool[] = [
  functionTool(
    "search_products",
    "Search the live Shopify catalog. Use before making product, price, or availability claims.",
    {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language product query",
        },
        maxPrice: {
          type: "number",
          description: "Optional maximum price in major currency units",
        },
        currency: { type: "string", description: "ISO 4217 currency code" },
        country: {
          type: "string",
          description: "ISO 3166-1 alpha-2 country code",
        },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  ),
  functionTool(
    "get_product_details",
    "Get current details and variants for one product returned by search.",
    {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
      additionalProperties: false,
    },
  ),
  functionTool(
    "recommend_products",
    "Find live products using the shopper request and available non-sensitive preferences.",
    {
      type: "object",
      properties: { request: { type: "string" } },
      required: ["request"],
      additionalProperties: false,
    },
  ),
  functionTool(
    "create_cart",
    "Add one verified, available Shopify variant to the shopper cart.",
    {
      type: "object",
      properties: {
        variantId: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["variantId", "quantity"],
      additionalProperties: false,
    },
  ),
  functionTool("view_cart", "Show the current cart.", {
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
  functionTool(
    "checkout",
    "Create a secure Shopify checkout handoff for a non-empty cart.",
    { type: "object", properties: {}, additionalProperties: false },
  ),
];

export async function runAiCommerceChat(input: {
  userId: string;
  connection: ConnectionRecord;
  conversationId: string;
  messageId: string;
  message: string;
  customerKey?: string;
  onTextDelta?: (text: string) => void;
}): Promise<GenieResponse> {
  assertSafeCustomerMessage(input.message);
  const context = await buildConversationContext({
    connection: input.connection,
    conversationId: input.conversationId,
    message: input.message,
    customerKey: input.customerKey,
  });
  await saveConversationMessage({
    conversationDbId: context.conversationDbId,
    clientMessageId: input.messageId,
    role: "user",
    content: input.message,
  });

  const provider = await getAiProvider();
  const messages: AiMessage[] = [
    {
      role: "system",
      content: await buildSystemPrompt(context.systemContext),
    },
    ...context.recentMessages,
    { role: "user", content: input.message },
  ];
  const result = await runAIToolLoop<GenieResponse>({
    provider,
    messages,
    tools,
    onTextDelta: input.onTextDelta,
    maxRounds: 5,
    maxTokens: 900,
    executeTool: async (call, round) => {
      let toolResult: GenieResponse;
      try {
        const action = toolCallToAction(
          call.function.name,
          call.function.arguments,
          context.profile,
        );
        toolResult = await executePermittedTool({
          userId: input.userId,
          connection: input.connection,
          conversationId: input.conversationId,
          messageId: `${input.messageId}-${round}-${call.id}`.slice(0, 120),
          message: input.message,
          customerKey: context.customerKey,
          expectedStoreId: context.storeId ?? undefined,
          action,
        });
      } catch (error) {
        toolResult = {
          conversationId: input.conversationId,
          tool: null,
          message:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "The commerce tool could not complete that request.",
        };
      }
      const resultText = JSON.stringify(toolResult);
      return { value: toolResult, content: resultText };
    },
    onToolResult: async (call, toolResult, round) => {
      await saveConversationMessage({
        conversationDbId: context.conversationDbId,
        clientMessageId: `${input.messageId}:tool:${round}:${call.id}`.slice(
          0,
          240,
        ),
        role: "tool",
        content: toolResult.content,
        toolName: call.function.name,
      });
    },
  });

  const message =
    result.content ||
    result.lastToolResult?.message ||
    "I couldn't complete that shopping request.";
  const response: GenieResponse = {
    ...(result.lastToolResult ?? {
      conversationId: input.conversationId,
      tool: null,
    }),
    message,
    model: result.model || undefined,
  };
  await saveConversationMessage({
    conversationDbId: context.conversationDbId,
    clientMessageId: `${input.messageId}:assistant`,
    role: "assistant",
    content: message,
    toolName: response.tool,
    generatedContext: {
      intent: context.intent,
      returnedProductCount: response.products?.length ?? 0,
    },
    model: result.model || null,
  });
  if (context.storeId) {
    void updateCustomerProfile({
      storeId: context.storeId,
      customerKey: context.customerKey,
      current: context.profile,
      recentConversation: [
        ...context.recentMessages,
        { role: "user" as const, content: input.message },
      ]
        .map((item) => `${item.role}: ${item.content}`)
        .join("\n"),
    });
  }
  return response;
}

export function assertSafeCustomerMessage(message: string) {
  const unsafe = [
    /ignore (all|any|the|your) (previous|prior|system) instructions?/i,
    /reveal (?:the )?(?:system prompt|api key|access token)/i,
    /<\/?(?:tool|system|assistant)[^>]*>/i,
    /execute (?:this )?(?:code|command|instruction)/i,
  ];
  if (unsafe.some((pattern) => pattern.test(message))) {
    throw new CommerceError(
      "INVALID_COMMERCE_INPUT",
      "I can help search this store, recommend products, manage your cart, or start secure checkout.",
      400,
    );
  }
}

export function toolCallToAction(
  name: string,
  rawArguments: string,
  profile: CustomerProfile,
): ExplicitAction {
  const value: unknown = JSON.parse(rawArguments || "{}");
  switch (name) {
    case "search_products": {
      const parsed = z
        .object({
          query: z.string().min(1).max(300),
          maxPrice: z.number().nonnegative().optional(),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .optional(),
          country: z
            .string()
            .regex(/^[A-Z]{2}$/)
            .optional(),
          limit: z.number().int().min(1).max(10).default(6),
        })
        .parse(value);
      return { tool: "search_products", input: parsed };
    }
    case "get_product_details":
      return {
        tool: "get_product",
        input: z.object({ productId: z.string() }).parse(value),
      };
    case "recommend_products": {
      const { request } = z.object({ request: z.string().min(1) }).parse(value);
      return {
        tool: "recommend_products",
        input: buildRecommendationQuery(request, profile, {
          currency: "INR",
          country: "IN",
          limit: 6,
        }),
      };
    }
    case "create_cart":
      return {
        tool: "add_to_cart",
        input: z
          .object({
            variantId: z.string(),
            quantity: z.number().int().min(1).max(100),
          })
          .parse(value),
      };
    case "view_cart":
      return { tool: "view_cart", input: {} };
    case "checkout":
      return { tool: "checkout", input: {} };
    default:
      throw new Error("Unsupported commerce tool");
  }
}

function functionTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): AiTool {
  return { type: "function", function: { name, description, parameters } };
}
