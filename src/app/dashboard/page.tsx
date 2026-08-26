import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { InspectorShell } from "@/components/inspector/inspector-shell";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasPublicSupabaseEnv()) redirect("/connect");
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: connection } = await supabase
    .from("shopify_connections")
    .select("shop_domain,shop_name,status,granted_scopes,verified_at")
    .maybeSingle();
  if (
    !connection ||
    connection.status === "disconnected" ||
    connection.status === "uninstalled"
  )
    redirect("/connect");
  return (
    <main className="app-shell">
      <AppHeader email={data.user.email ?? "Signed in"} />
      <InspectorShell connection={connection} />
    </main>
  );
}
