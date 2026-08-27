import { ALADDYN_UCP_AGENT_PROFILE } from "@/lib/commerce/shopify/ucp/agent-profile";

export const dynamic = "force-static";

export function GET() {
  return Response.json(ALADDYN_UCP_AGENT_PROFILE, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
