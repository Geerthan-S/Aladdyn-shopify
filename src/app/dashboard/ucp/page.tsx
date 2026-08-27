import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { UcpInspector } from "@/components/inspector/ucp-inspector";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UcpInspectorPage() {
  if (!hasPublicSupabaseEnv()) redirect("/connect");
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: connection } = await supabase
    .from("shopify_connections")
    .select("shop_domain,status")
    .maybeSingle();
  if (!connection || connection.status !== "connected") redirect("/connect");
  return (
    <>
      <AppHeader email={data.user.email ?? "Signed in"} />
      <UcpInspector store={connection.shop_domain} />
    </>
  );
}
