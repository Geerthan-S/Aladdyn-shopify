import { redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { InspectorShell } from "@/components/inspector/inspector-shell";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { getConnectionForUser } from "@/lib/shopify/connection";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasPublicSupabaseEnv()) redirect("/connect");
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const connection = await getConnectionForUser(data.user.id);
  if (
    !connection ||
    connection.status === "disconnected" ||
    connection.status === "uninstalled"
  )
    return (
      <main className="app-shell">
        <AppHeader email={data.user.email ?? "Signed in"} />
        <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-3xl place-items-center px-5 py-12">
          <div className="panel p-6 sm:p-8">
            <div className="text-xs font-bold tracking-[.16em] text-cyan-700 uppercase">
              Dashboard
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Connect Shopify to open the inspector.
            </h1>
            <p className="mt-3 leading-7 text-slate-500">
              The dashboard is ready, but it needs a verified Shopify connection
              before it can show store data, sync status, products, orders, and
              UCP / MCP details.
            </p>
            <Link className="btn-primary mt-6 px-5 py-3" href="/connect">
              Connect Shopify
            </Link>
          </div>
        </section>
      </main>
    );
  return (
    <main className="app-shell">
      <AppHeader email={data.user.email ?? "Signed in"} />
      <InspectorShell connection={connection} />
    </main>
  );
}
