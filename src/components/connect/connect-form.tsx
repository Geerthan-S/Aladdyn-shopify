"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { normalizeShopDomain } from "@/lib/shopify/domain";

export function ConnectForm({ defaultShop }: { defaultShop?: string }) {
  const [error, setError] = useState<string | null>(null);
  function validate(event: FormEvent<HTMLFormElement>) {
    const input = new FormData(event.currentTarget).get("shop");
    try {
      normalizeShopDomain(String(input ?? ""));
      setError(null);
    } catch (reason) {
      event.preventDefault();
      setError(
        reason instanceof Error
          ? reason.message
          : "Enter a valid Shopify store domain",
      );
    }
  }
  return (
    <form
      action="/api/shopify/install"
      className="panel p-6 sm:p-8"
      method="post"
      onSubmit={validate}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">
        Connect your Shopify store
      </h2>
      <p className="mt-2 leading-7 text-slate-500">
        Enter the permanent{" "}
        <strong className="font-medium text-slate-700">.myshopify.com</strong>{" "}
        domain. You’ll continue on Shopify to log in and approve installation.
      </p>
      <label className="mt-6 block">
        <span className="mb-2 block text-sm font-semibold">
          Shopify store domain
        </span>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="field flex-1"
            defaultValue={defaultShop}
            name="shop"
            placeholder="mystore.myshopify.com"
            required
          />
          <button
            className="btn-primary px-5 py-3 whitespace-nowrap"
            type="submit"
          >
            Continue to Shopify <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </label>
      {error && (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}
      <div className="mt-7 border-t border-slate-100 pt-5">
        <div className="text-xs font-bold tracking-[.14em] text-slate-400 uppercase">
          Read-only permissions
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Products", "Inventory", "Locations", "Orders", "Discounts"].map(
            (scope) => (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600"
                key={scope}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {scope}
              </span>
            ),
          )}
        </div>
      </div>
    </form>
  );
}
