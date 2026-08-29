export const runtime = "nodejs";

import { ZodError } from "zod";
import { runAiCommerceChat } from "@/lib/ai/chatbot";
import { requireUser } from "@/lib/auth/require-user";
import {
  commerceUserMessage,
  CommerceError,
} from "@commerce-agent/tools/errors";
import { chatRequestSchema } from "@/lib/commerce/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inferDeterministicAction } from "@/lib/commerce/tool-router";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";
import { executePermittedTool } from "@/lib/tools/router";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit(user.id, "genie-chat", 30, 60);
    const parsed = chatRequestSchema.parse(await request.json());
    const connection = await getConnectionForUser(user.id);
    if (!connection || connection.status !== "connected") {
      throw new AppError(
        "CONNECTION_NOT_FOUND",
        "Connect a Shopify store before using Genie",
        409,
      );
    }
    const action = parsed.action ?? inferDeterministicAction(parsed.message);
    if (parsed.stream && !action) {
      return streamChat({
        userId: user.id,
        connection,
        conversationId: parsed.conversationId,
        messageId: parsed.messageId,
        message: parsed.message,
        customerKey: parsed.customerKey,
      });
    }
    const response = action
      ? await executePermittedTool({
          userId: user.id,
          connection,
          conversationId: parsed.conversationId,
          messageId: parsed.messageId,
          message: parsed.message,
          customerKey: parsed.customerKey ?? `visitor:${parsed.conversationId}`,
          action,
        })
      : await runAiCommerceChat({
          userId: user.id,
          connection,
          conversationId: parsed.conversationId,
          messageId: parsed.messageId,
          message: parsed.message,
          customerKey: parsed.customerKey,
        });
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CommerceError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: commerceUserMessage(error),
            requestId: error.requestId,
          },
        },
        { status: error.status },
      );
    }
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: {
            code: "INVALID_COMMERCE_INPUT",
            message: "That shopping request wasn't valid. Please try again.",
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }
    return safeErrorResponse(error);
  }
}

function streamChat(input: Parameters<typeof runAiCommerceChat>[0]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let streamedText = false;
        const response = await runAiCommerceChat({
          ...input,
          onTextDelta(text) {
            streamedText = true;
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ type: "text", text })}\n`),
            );
          },
        });
        if (!streamedText) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ type: "text", text: response.message })}\n`,
            ),
          );
        }
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "result", response })}\n`),
        );
      } catch (error) {
        const message =
          error instanceof CommerceError
            ? commerceUserMessage(error)
            : error instanceof AppError
              ? error.message
              : "The AI assistant is temporarily unavailable.";
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message })}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
