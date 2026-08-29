"use client";

import { DatabaseZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SyncStatus = {
  status: "not_synced" | "syncing" | "ready" | "failed" | "setup_required";
  productCount: number;
  lastSyncedAt: string | null;
  error: string | null;
};

export function SyncStatusCard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/shopify/sync", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error?.message ?? "Sync status unavailable");
    setStatus(body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Sync status unavailable",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function sync() {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/shopify/sync", { method: "POST" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Product sync failed");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Product sync failed",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <DatabaseZap className="mt-0.5 h-5 w-5 text-cyan-700" />
          <div>
            <div className="font-semibold text-slate-950">
              AI product context
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {status?.status === "ready"
                ? `${status.productCount} normalized products synced${status.lastSyncedAt ? ` · ${new Date(status.lastSyncedAt).toLocaleString()}` : ""}`
                : status?.status === "setup_required"
                  ? "Apply database migrations 002 and 003 before the first sync."
                  : status?.status === "failed"
                    ? "The previous sync failed. Your live Shopify data is unchanged."
                    : "Sync products, variants, collections, prices, and availability for AI context."}
            </p>
            {(error || status?.error) && (
              <p className="mt-2 text-xs text-rose-700">
                {error || status?.error}
              </p>
            )}
          </div>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={working || status?.status === "setup_required"}
          onClick={() => void sync()}
        >
          <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} />
          {working
            ? "Syncing…"
            : status?.status === "ready"
              ? "Sync again"
              : "Sync products"}
        </button>
      </div>
    </div>
  );
}
