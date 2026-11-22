"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type StatTone =
  | "violet"
  | "emerald"
  | "amber"
  | "sky"
  | "rose"
  | "slate";

const TONES: Record<StatTone, { chip: string; glow: string }> = {
  violet: { chip: "bg-violet-50 text-violet-600 ring-violet-100", glow: "from-violet-500/25" },
  emerald: { chip: "bg-emerald-50 text-emerald-600 ring-emerald-100", glow: "from-emerald-500/25" },
  amber: { chip: "bg-amber-50 text-amber-600 ring-amber-100", glow: "from-amber-500/25" },
  sky: { chip: "bg-sky-50 text-sky-600 ring-sky-100", glow: "from-sky-500/25" },
  rose: { chip: "bg-rose-50 text-rose-600 ring-rose-100", glow: "from-rose-500/25" },
  slate: { chip: "bg-slate-100 text-slate-600 ring-slate-200", glow: "from-slate-500/20" },
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  /** Optional secondary line, e.g. a short clarification. */
  hint?: string;
  isLoading?: boolean;
}

/**
 * Reusable metric card shared by the Home overview and both report pages.
 * While `isLoading`, the value is replaced with a skeleton so the card never
 * shows a misleading zero.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "violet",
  hint,
  isLoading = false,
}: StatCardProps) {
  const { chip, glow } = TONES[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass-card relative overflow-hidden rounded-3xl p-5"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${glow} to-transparent blur-xl`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>

          {isLoading ? (
            <span
              aria-hidden
              className="mt-2 block h-7 w-14 animate-pulse rounded-lg bg-slate-200"
            />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
              {value}
            </p>
          )}

          {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${chip}`}
        >
          <Icon size={18} />
        </span>
      </div>
    </motion.div>
  );
}
