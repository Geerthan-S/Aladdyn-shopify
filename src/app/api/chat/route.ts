export const runtime = "nodejs";

import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { commerceUserMessage, CommerceError } from "@/lib/commerce/errors";
import { chatRequestSchema } from "@/lib/commerce/schemas";
import { routeGenieMessage } from "@/lib/commerce/tool-router";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { AppError, safeErrorResponse } from "@/lib/shopify/errors";

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
    const response = await routeGenieMessage({
      userId: user.id,
      storeDomain: connection.shop_domain,
      ...parsed,
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
