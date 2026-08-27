"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { useState } from "react";

type Health = {
  store: string;
  discoveryUrl: string;
  version: string;
  mcpEndpoint: string;
  catalog: Record<string, boolean>;
  cart: Record<string, boolean>;
  checkout: Record<string, boolean | string>;
  agent: {
    profile: "healthy" | "error";
    token: "healthy" | "error" | "not_configured";
    profileUrl: string;
  };
  checkedAt: string;
};

export function UcpInspector({ store }: { store: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runChecks() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/shopify/ucp/health", {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Checks failed");
      setHealth(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checks failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="mx-auto max-w-6xl p-5 sm:p-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-[.16em] text-cyan-700 uppercase">
              Shopify Data Inspector
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              UCP / MCP
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Capability discovery and safe agent-commerce health for {store}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={loading}
            onClick={runChecks}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Run UCP Checks
          </button>
        </div>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          <Link
            className="px-4 py-3 text-sm font-semibold text-slate-500"
            href="/dashboard"
          >
            Admin GraphQL
          </Link>
          <span className="border-b-2 border-cyan-600 px-4 py-3 text-sm font-semibold text-cyan-800">
            UCP / MCP
          </span>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </div>
        )}
        {!health ? (
          <div className="panel grid min-h-72 place-items-center p-8 text-center text-slate-500">
            Run the non-destructive checks. They do not create a cart or
            checkout.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <InfoCard
              title="Store"
              rows={[
                ["Domain", health.store],
                ["Discovery", health.discoveryUrl],
                ["UCP version", health.version],
                ["MCP endpoint", health.mcpEndpoint],
              ]}
            />
            <InfoCard
              title="Agent"
              rows={[
                ["Agent profile", health.agent.profile],
                ["Agent token", health.agent.token],
                ["Profile URL", health.agent.profileUrl],
                ["Secret", "Never displayed"],
              ]}
            />
            <CapabilityCard title="Catalog" values={health.catalog} />
            <CapabilityCard title="Cart" values={health.cart} />
            <CapabilityCard title="Checkout" values={health.checkout} />
          </div>
        )}
      </section>
    </main>
  );
}

function InfoCard({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="panel p-5">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div className="grid gap-1 sm:grid-cols-[140px_1fr]" key={label}>
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-sm font-medium break-all text-slate-800">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CapabilityCard({
  title,
  values,
}: {
  title: string;
  values: Record<string, boolean | string>;
}) {
  return (
    <section className="panel p-5">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-2">
        {Object.entries(values).map(([name, supported]) => {
          const ok = supported === true;
          return (
            <div
              className="flex items-center justify-between gap-3 text-sm"
              key={name}
            >
              <code className="text-slate-700">{name}</code>
              <span
                className={`inline-flex items-center gap-1.5 ${ok ? "text-emerald-700" : "text-slate-500"}`}
              >
                {ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <CircleAlert className="h-4 w-4" />
                )}
                {typeof supported === "string"
                  ? supported.replaceAll("_", " ")
                  : supported
                    ? "Supported"
                    : "Unsupported"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
