import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ConnectForm } from "@/components/connect/connect-form";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  CONFIGURATION_REQUIRED:
    "Draft testing needs a Shopify development store. Configure its myshopify.com domain and try again.",
  INVALID_SHOP: "The configured Shopify development store domain is invalid.",
  OWNERSHIP_CONFLICT:
    "That Shopify store is already linked to another Aladdyn account.",
  OAUTH_INVALID:
    "Shopify could not verify the installation response. Please try again.",
  OAUTH_EXPIRED:
    "The installation request expired or was already used. Start again.",
  RATE_LIMITED: "Too many connection attempts. Wait a few minutes and retry.",
  NETWORK_ERROR: "The connection service is temporarily unavailable.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!hasPublicSupabaseEnv()) return <SetupRequired />;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: connection } = await supabase
    .from("shopify_connections")
    .select("shop_domain,shop_name,status,verified_at")
    .maybeSingle();
  if (connection?.status === "connected") redirect("/dashboard");
  const params = await searchParams;
  return (
    <main className="app-shell">
      <AppHeader email={data.user.email ?? "Signed in"} />
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <div className="mb-8">
          <div className="text-xs font-bold tracking-[.16em] text-cyan-700 uppercase">
            Store connection
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
            Open the door to your store data.
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-500">
            Aladdyn sends you to Shopify’s secure authorization page. Your
            Shopify password never passes through this application.
          </p>
        </div>
        {params.error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {messages[params.error] ?? messages.NETWORK_ERROR}
          </div>
        )}
        <ConnectForm />
        {connection && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Previous connection:{" "}
            <strong>{connection.shop_name || connection.shop_domain}</strong> (
            {connection.status}). Completing Shopify authorization will replace
            its credentials only after verification.
          </div>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">
          Need to inspect an existing connection?{" "}
          <Link className="font-semibold text-cyan-700" href="/dashboard">
            Open dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <section className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="eyebrow">Configuration required</div>
        <h1 className="mt-5 text-3xl font-semibold">
          Connect Supabase before testing sign-in.
        </h1>
        <p className="mt-3 leading-7 text-slate-300">
          Copy <code>.env.example</code> to <code>.env.local</code>, add the
          Supabase browser keys, apply the SQL migration, and restart the app.
        </p>
      </section>
    </main>
  );
}
