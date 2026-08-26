"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { normalizeShopDomain } from "@/lib/shopify/domain";

const POPUP_NAME = "aladdyn-shopify-oauth";
const POPUP_FEATURES =
  "popup=yes,width=720,height=820,resizable=yes,scrollbars=yes";

export function ConnectForm({ defaultShop }: { defaultShop?: string }) {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    function complete() {
      popupRef.current?.close();
      router.replace("/dashboard?connected=1");
      router.refresh();
    }

    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "aladdyn:shopify-connected") complete();
      if (event.data?.type === "aladdyn:shopify-failed") {
        popupRef.current?.close();
        setWaiting(false);
        setError(
          "Shopify did not complete the installation. Please try again.",
        );
      }
    }

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [router]);

  useEffect(() => {
    if (!waiting) return;

    let active = true;
    async function checkConnection() {
      try {
        const response = await fetch("/api/shopify/connection", {
          cache: "no-store",
        });
        if (!response.ok || !active) return;
        const body = (await response.json()) as {
          connection?: { status?: string } | null;
        };
        if (
          body.connection?.status === "connected" ||
          body.connection?.status === "needs_reauthorization"
        ) {
          popupRef.current?.close();
          router.replace("/dashboard?connected=1");
          router.refresh();
        }
      } catch {
        // The popup completion message remains the primary fast path.
      }
    }

    void checkConnection();
    const interval = window.setInterval(() => void checkConnection(), 1500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [router, waiting]);

  function validate(event: FormEvent<HTMLFormElement>) {
    if (waiting) {
      event.preventDefault();
      return;
    }

    const input = event.currentTarget.elements.namedItem("shop");
    try {
      const shop = normalizeShopDomain(
        input instanceof HTMLInputElement ? input.value : "",
      );
      if (input instanceof HTMLInputElement) input.value = shop;

      const popup = window.open("about:blank", POPUP_NAME, POPUP_FEATURES);
      if (!popup) {
        event.preventDefault();
        setError("Allow popups for Aladdyn, then try again.");
        return;
      }

      popupRef.current = popup;
      popup.document.title = "Opening Shopify…";
      popup.document.body.innerHTML =
        '<p style="font:16px system-ui;padding:32px">Opening Shopify secure login…</p>';
      setError(null);
      setWaiting(true);
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
      target={POPUP_NAME}
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
            disabled={waiting}
            type="submit"
          >
            {waiting ? "Waiting for Shopify…" : "Continue to Shopify"}
            {!waiting && <ArrowRight className="h-4 w-4" />}
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
