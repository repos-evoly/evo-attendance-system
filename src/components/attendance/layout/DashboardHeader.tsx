"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface DashboardHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  /** Slot for header actions (e.g. a future Device Sync button). */
  actions?: ReactNode;
}

export function DashboardHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: DashboardHeaderProps) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="glass-card rounded-3xl px-5 py-5 md:px-7 md:py-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {hasBreadcrumbs && (
            <nav
              aria-label="Breadcrumb"
              className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500"
            >
              {breadcrumbs.map((crumb, index) => (
                <span
                  key={`${crumb.label}-${index}`}
                  className="flex items-center gap-2"
                >
                  {index > 0 && (
                    <span aria-hidden className="text-slate-300">
                      /
                    </span>
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-violet-600"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-slate-700">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}

          <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            {title}
          </h1>

          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </motion.header>
  );
}
