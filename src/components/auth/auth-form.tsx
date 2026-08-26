"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Mode = "login" | "signup" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const supabase = createBrowserSupabase();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace("/connect");
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/connect`,
          },
        });
        if (error) throw error;
        setMessage(
          "Check your inbox to verify your email, then return to Aladdyn.",
        );
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setMessage("If an account exists, a recovery link is on its way.");
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated. Redirecting…");
        setTimeout(() => router.replace("/connect"), 700);
      }
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Authentication failed";
      setMessage(
        raw.replace(
          "Invalid login credentials",
          "Email or password is incorrect",
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  const needsEmail = mode !== "reset";
  const needsPassword =
    mode === "login" || mode === "signup" || mode === "reset";
  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      {needsEmail && (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Email</span>
          <input
            className="field"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
      )}
      {needsPassword && (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">
            {mode === "reset" ? "New password" : "Password"}
          </span>
          <input
            className="field"
            name="password"
            type="password"
            minLength={8}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
        </label>
      )}
      <button
        className="btn-primary w-full py-3"
        disabled={loading}
        type="submit"
      >
        {loading
          ? "Please wait…"
          : mode === "login"
            ? "Log in"
            : mode === "signup"
              ? "Create account"
              : mode === "forgot"
                ? "Send recovery link"
                : "Update password"}
      </button>
      {message && (
        <p
          className="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-700"
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
