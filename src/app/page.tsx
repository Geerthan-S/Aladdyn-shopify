import Link from "next/link";
import { ArrowRight, Database, LockKeyhole, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="hero-grid absolute inset-0 opacity-40" />
      <div className="absolute top-[-18rem] left-1/2 h-[36rem] w-[48rem] -translate-x-1/2 rounded-full bg-cyan-400/15 blur-[120px]" />
      <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Brand />
        <div className="flex items-center gap-3">
          <Link className="btn-ghost" href="/login">
            Log in
          </Link>
          <Link className="btn-primary" href="/signup">
            Create account
          </Link>
        </div>
      </nav>
      <section className="relative mx-auto grid max-w-7xl gap-14 px-6 pt-20 pb-20 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pt-28">
        <div className="max-w-3xl">
          <div className="eyebrow">Secure commerce intelligence</div>
          <h1 className="mt-6 text-5xl font-semibold tracking-[-0.05em] text-balance sm:text-6xl lg:text-7xl">
            Bring your Shopify data into one clear view.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            Connect a development or merchant store through Shopify’s official
            install flow. Aladdyn then gives you a read-only, paginated view of
            products, inventory, orders, discounts, and more.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link className="btn-primary px-6 py-3.5" href="/signup">
              Connect a Shopify store <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn-ghost px-6 py-3.5" href="/login">
              I already have an account
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-slate-400">
            <LockKeyhole className="h-4 w-4 text-cyan-300" />
            Aladdyn never asks for or stores your Shopify admin password.
          </p>
        </div>
        <div className="relative lg:pt-4">
          <div className="dashboard-preview">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500 uppercase">
                  Connected store
                </div>
                <div className="mt-1 font-medium">northstar.myshopify.com</div>
              </div>
              <span className="status-connected">Connected</span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-white/10">
              {[
                ["Products", "1,284"],
                ["Locations", "6"],
                ["Orders", "25 / page"],
              ].map(([label, value]) => (
                <div className="bg-[#0c1828] p-5" key={label}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="mt-2 text-xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-3 p-5">
              {[82, 64, 91, 48].map((width, index) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.025] p-3"
                  key={width}
                >
                  <div className="h-9 w-9 rounded-lg bg-cyan-300/10" />
                  <div className="flex-1">
                    <div
                      className="h-2.5 rounded-full bg-slate-600/50"
                      style={{ width: `${width}%` }}
                    />
                    <div className="mt-2 h-2 w-1/3 rounded-full bg-slate-700/50" />
                  </div>
                  <span className="font-mono text-xs text-slate-500">
                    0{index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="relative mx-auto grid max-w-7xl gap-4 px-6 pb-16 sm:grid-cols-3 lg:px-10">
        {[
          [
            ShieldCheck,
            "Official authorization",
            "Merchants approve read-only access on Shopify’s own screen.",
          ],
          [
            LockKeyhole,
            "Encrypted credentials",
            "Offline token pairs are encrypted with AES-256-GCM and stay server-side.",
          ],
          [
            Database,
            "Purpose-built inspector",
            "Allowlisted GraphQL queries with pagination, scope status, and raw JSON.",
          ],
        ].map(([Icon, title, body]) => {
          const FeatureIcon = Icon as typeof ShieldCheck;
          return (
            <div className="feature-card" key={String(title)}>
              <FeatureIcon className="h-5 w-5 text-cyan-300" />
              <h2>{String(title)}</h2>
              <p>{String(body)}</p>
            </div>
          );
        })}
      </section>
    </main>
  );
}
