import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
export function ConnectForm() {
  return (
    <form
      action="/api/shopify/install"
      className="panel p-6 sm:p-8"
      method="get"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">
        Connect your Shopify store
      </h2>
      <p className="mt-2 leading-7 text-slate-500">
        Continue to Shopify to log in and review Aladdyn’s read-only
        permissions. Aladdyn never asks for your Shopify password.
      </p>
      <button className="btn-primary mt-6 px-5 py-3" type="submit">
        Connect with Shopify <ArrowRight className="h-4 w-4" />
      </button>
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
