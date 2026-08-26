import Link from "next/link";
import { Brand } from "@/components/brand";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#07111f] px-5 py-12">
      <div className="hero-grid absolute inset-0 opacity-40" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        <section className="rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-2 leading-7 text-slate-500">{description}</p>
          {children}
          {footer && (
            <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
              {footer}
            </div>
          )}
        </section>
        <p className="mt-5 text-center text-xs text-slate-500">
          Shopify credentials are entered only on Shopify.
        </p>
      </div>
    </main>
  );
}
export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="font-semibold text-cyan-700 hover:text-cyan-900"
      href={href}
    >
      {children}
    </Link>
  );
}
