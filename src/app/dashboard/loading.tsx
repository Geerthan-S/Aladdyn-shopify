export default function DashboardLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        <p className="mt-4 text-sm text-slate-400">
          Opening the secure inspector…
        </p>
      </div>
    </main>
  );
}
