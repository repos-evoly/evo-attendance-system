"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  LoaderCircle,
  LockKeyhole,
  ScanFace,
  TriangleExclamationPoint,
  UserRound,
} from "lucide-react";

interface LoginResponse {
  success?: boolean;
  message?: string;
}

const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-200/80 bg-white/80 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.message ?? "Could not sign in. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // The session cookie is already set; re-enter the dashboard through the
      // server so the Proxy sees the cookie on the very first request.
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50 px-4 py-10 text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none fixed -right-24 -top-24 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-24 left-[8%] h-72 w-72 rounded-full bg-fuchsia-200/25 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="glass-card relative z-10 w-full max-w-md rounded-3xl p-6 md:p-8"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-600 to-purple-700 text-white shadow-[0_12px_28px_-10px_rgba(124,92,255,0.7)]">
            <ScanFace size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Attendance Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your admin account to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              Username
            </label>
            <div className="relative">
              <UserRound
                size={18}
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="login-username"
                name="username"
                type="text"
                required
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isSubmitting}
                placeholder="admin"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              Password
            </label>
            <div className="relative">
              <LockKeyhole
                size={18}
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                placeholder="••••••"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3 text-xs text-rose-700"
            >
              <TriangleExclamationPoint size={16} className="mt-px shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <LoaderCircle size={16} className="animate-spin" />}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
