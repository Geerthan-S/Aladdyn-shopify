import Link from "next/link";

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      className={`flex items-center gap-3 ${dark ? "text-slate-950" : "text-white"}`}
      href="/"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300 font-black text-[#07111f]">
        A
      </span>
      <span className="text-lg font-semibold tracking-tight">Aladdyn</span>
    </Link>
  );
}
