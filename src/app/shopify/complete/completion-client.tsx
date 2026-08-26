"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleX } from "lucide-react";

export function ShopifyCompletion({ error }: { error?: string }) {
  const router = useRouter();

  useEffect(() => {
    const type = error ? "aladdyn:shopify-failed" : "aladdyn:shopify-connected";

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type }, window.location.origin);
      window.close();
      return;
    }

    if (!error) router.replace("/dashboard?connected=1");
  }, [error, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <section className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        {error ? (
          <CircleX className="mx-auto h-10 w-10 text-rose-300" />
        ) : (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
        )}
        <h1 className="mt-5 text-2xl font-semibold">
          {error ? "Shopify connection was not completed" : "Shopify connected"}
        </h1>
        <p className="mt-3 leading-7 text-slate-300">
          {error
            ? "Close this window and try the connection again from Aladdyn."
            : "Your encrypted connection is ready. This window will close and your dashboard will load automatically."}
        </p>
        <Link
          className="mt-6 inline-flex rounded-xl bg-cyan-300 px-4 py-2.5 font-semibold text-slate-950"
          href={error ? "/connect" : "/dashboard?connected=1"}
        >
          {error ? "Return to connection" : "Open dashboard"}
        </Link>
      </section>
    </main>
  );
}
