"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
        <Brand dark />
        <div className="flex items-center gap-3">
          <Link
            className="hidden text-sm font-medium text-slate-500 hover:text-slate-950 sm:block"
            href="/genie"
          >
            Genie
          </Link>
          <Link
            className="hidden text-sm font-medium text-slate-500 hover:text-slate-950 sm:block"
            href="/dashboard"
          >
            Inspector
          </Link>
          <Link
            className="hidden text-sm font-medium text-slate-500 hover:text-slate-950 sm:block"
            href="/connect"
          >
            Connection
          </Link>
          <span className="hidden h-5 w-px bg-slate-200 sm:block" />
          <span className="max-w-44 truncate text-sm text-slate-500">
            {email}
          </span>
          <button
            aria-label="Log out"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
