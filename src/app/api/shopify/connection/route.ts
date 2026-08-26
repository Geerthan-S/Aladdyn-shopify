export const runtime = "nodejs";

import { requireUser } from "@/lib/auth/require-user";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { safeErrorResponse } from "@/lib/shopify/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const connection = await getConnectionForUser(user.id);
    return Response.json(
      { connection },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
