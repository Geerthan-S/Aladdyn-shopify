"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Braces,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Database,
  RefreshCw,
  Table2,
} from "lucide-react";

const datasets = [
  ["shop", "Shop details"],
  ["scopes", "Granted scopes"],
  ["products", "Products"],
  ["variants", "Variants"],
  ["collections", "Collections"],
  ["inventory", "Inventory"],
  ["locations", "Locations"],
  ["orders", "Orders"],
  ["discounts", "Discounts"],
  ["protected-data", "Protected data"],
] as const;
type Dataset = (typeof datasets)[number][0];
type Envelope = {
  dataset: Dataset;
  items: Record<string, unknown>[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  access: { status: string; requiredScopes: string[]; grantedScopes: string[] };
  graphQL: {
    requestedCost: number;
    actualCost: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
  fetchedAt: string;
};

export function InspectorShell({
  connection,
}: {
  connection: {
    shop_domain: string;
    shop_name: string | null;
    status: string;
    granted_scopes: string[];
    verified_at: string | null;
  };
}) {
  const router = useRouter();
  const [dataset, setDataset] = useState<Dataset>("shop");
  const [payload, setPayload] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ limit: "25", ...cursor });
    try {
      const response = await fetch(`/api/shopify/data/${dataset}?${query}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Dataset request failed");
      setPayload(body);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Dataset request failed",
      );
    } finally {
      setLoading(false);
    }
  }, [dataset, cursor]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  function choose(next: Dataset) {
    setDataset(next);
    setCursor({});
    setRaw(false);
  }
  async function copy() {
    if (payload)
      await navigator.clipboard.writeText(
        JSON.stringify(payload.items, null, 2),
      );
  }
  async function disconnect() {
    if (
      !window.confirm(
        "Disconnect this store and remove Aladdyn’s local token access? You must also uninstall the app in Shopify Admin to revoke Shopify-side access.",
      )
    )
      return;
    const response = await fetch("/api/shopify/disconnect", { method: "POST" });
    if (response.ok) {
      router.push("/connect");
      router.refresh();
    } else setError("Disconnect could not be completed safely.");
  }
  const columns = useMemo(() => {
    const first = payload?.items[0];
    return first ? Object.keys(first).slice(0, 8) : [];
  }, [payload]);
  return (
    <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-slate-200 bg-[#0a1626] p-4 text-slate-300 lg:border-r lg:border-b-0 lg:border-slate-800 lg:p-5">
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] font-bold tracking-[.16em] text-slate-500 uppercase">
            Connected store
          </div>
          <div className="mt-2 truncate font-semibold text-white">
            {connection.shop_name || connection.shop_domain}
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {connection.shop_domain}
          </div>
          <span className="mt-3 inline-block rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-300 uppercase">
            {connection.status.replaceAll("_", " ")}
          </span>
        </div>
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-5 lg:grid-cols-1">
          {datasets.map(([key, label]) => (
            <button
              className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${dataset === key ? "bg-cyan-300 font-semibold text-slate-950" : "hover:bg-white/7 hover:text-white"}`}
              key={key}
              onClick={() => choose(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-5 space-y-2">
          <form action="/api/shopify/reconnect" method="post">
            <button
              className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              type="submit"
            >
              Reconnect / update scopes
            </button>
          </form>
          <button
            className="w-full rounded-lg px-3 py-2 text-sm text-rose-300 hover:bg-rose-400/10"
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
      </aside>
      <section className="min-w-0 p-5 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold tracking-[.16em] text-cyan-700 uppercase">
                Shopify Data Inspector
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {datasets.find(([key]) => key === dataset)?.[1]}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Read-only · API 2026-07 ·{" "}
                {payload?.fetchedAt
                  ? `Fetched ${new Date(payload.fetchedAt).toLocaleTimeString()}`
                  : "Waiting for data"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
                onClick={() => void load()}
                title="Retry"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => setRaw((value) => !value)}
              >
                {raw ? (
                  <Table2 className="h-4 w-4" />
                ) : (
                  <Braces className="h-4 w-4" />
                )}
                {raw ? "Table" : "Raw JSON"}
              </button>
              <button
                className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
                onClick={() => void copy()}
                title="Copy JSON"
              >
                <Clipboard className="h-4 w-4" />
              </button>
            </div>
          </div>
          {payload && (
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full px-3 py-1.5 font-semibold ${payload.access.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
              >
                Access: {payload.access.status.replaceAll("_", " ")}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                Cost {payload.graphQL.actualCost} · Available{" "}
                {payload.graphQL.currentlyAvailable} · Restore{" "}
                {payload.graphQL.restoreRate}/s
              </span>
            </div>
          )}
          <div className="panel mt-6 min-h-80 overflow-hidden">
            {loading ? (
              <LoadingState />
            ) : error ? (
              <ErrorState message={error} retry={() => void load()} />
            ) : !payload?.items.length ? (
              <EmptyState />
            ) : raw ? (
              <pre className="max-h-[65vh] overflow-auto p-5 text-xs leading-6 text-slate-700">
                {JSON.stringify(payload.items, null, 2)}
              </pre>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      {columns.map((column) => (
                        <th
                          className="border-b border-slate-200 px-4 py-3 font-semibold"
                          key={column}
                        >
                          {humanize(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payload.items.map((item, index) => (
                      <tr
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                        key={String(item.id ?? index)}
                      >
                        {columns.map((column) => (
                          <td
                            className="max-w-72 truncate px-4 py-3 text-slate-700"
                            key={column}
                            title={display(item[column])}
                          >
                            {display(item[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Up to 25 records per request
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
                disabled={!payload?.pageInfo.hasPreviousPage || loading}
                onClick={() =>
                  setCursor({
                    before: payload?.pageInfo.startCursor ?? undefined,
                  })
                }
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-40"
                disabled={!payload?.pageInfo.hasNextPage || loading}
                onClick={() =>
                  setCursor({ after: payload?.pageInfo.endCursor ?? undefined })
                }
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}
function display(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
function LoadingState() {
  return (
    <div className="grid min-h-80 place-items-center">
      <div className="text-center">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-cyan-700" />
        <p className="mt-3 text-sm text-slate-500">
          Fetching safely from Shopify…
        </p>
      </div>
    </div>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="grid min-h-80 place-items-center p-8 text-center">
      <div>
        <AlertTriangle className="mx-auto h-7 w-7 text-amber-600" />
        <h2 className="mt-3 font-semibold">This dataset is unavailable</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          {message}
        </p>
        <button
          className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          onClick={retry}
        >
          Retry safely
        </button>
      </div>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="grid min-h-80 place-items-center p-8 text-center">
      <div>
        <Database className="mx-auto h-7 w-7 text-slate-400" />
        <h2 className="mt-3 font-semibold">No records in this range</h2>
        <p className="mt-2 text-sm text-slate-500">
          The store may be empty, or Shopify may limit the accessible history.
        </p>
      </div>
    </div>
  );
}
