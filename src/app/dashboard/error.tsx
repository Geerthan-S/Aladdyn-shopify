"use client";
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">
          The dashboard could not be opened.
        </h1>
        <p className="mt-3 text-slate-400">
          No credentials were exposed. Retry, or reconnect the store if the
          problem continues.
        </p>
        <button className="btn-primary mt-6" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
