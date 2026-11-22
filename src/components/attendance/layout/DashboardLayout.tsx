"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
import { FloatingSidebar } from "./FloatingSidebar";

/**
 * Shared dashboard shell: floating sidebar plus the animated content column.
 * Purely presentational - it holds no page-specific business logic.
 *
 * `MotionConfig reducedMotion="user"` lets Framer Motion honour the OS
 * reduced-motion preference internally. It replaces the per-component
 * `useReducedMotion()` checks: that hook returns `null` while server
 * rendering but the real boolean on the client's first render, so any markup
 * derived from it differed between the server HTML and hydration.
 */
export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50 text-slate-900">
        <div
          aria-hidden
          className="pointer-events-none fixed -right-24 -top-24 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none fixed -bottom-24 left-[12%] h-72 w-72 rounded-full bg-fuchsia-200/25 blur-3xl"
        />

        <FloatingSidebar />

        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative z-10 flex min-h-screen w-full flex-col gap-6 px-4 py-6 pl-24 md:px-8 md:pl-28 lg:pl-32"
        >
          {children}
        </motion.main>
      </div>
    </MotionConfig>
  );
}
