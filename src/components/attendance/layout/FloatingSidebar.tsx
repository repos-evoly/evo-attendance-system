"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useCurrentUser } from "@/hooks/attendance/useCurrentUser";
import type { UserRole } from "@/types/attendance/user.types";
import {
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CalendarRange,
  House,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

interface SidebarNavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Roles allowed to see this link. Omitted means every role. */
  roles?: readonly UserRole[];
}

/**
 * Sidebar navigation across the dashboard surfaces.
 */
const NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: "Home", href: "/", icon: House },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Shifts", href: "/shifts", icon: CalendarCog },
  { label: "Daily Report", href: "/daily-report", icon: CalendarDays },
  { label: "Monthly Report", href: "/monthly-report", icon: CalendarRange },
  { label: "Leaves", href: "/leaves", icon: CalendarClock },
  { label: "Waivers", href: "/waivers", icon: ShieldCheck },
  { label: "Device Sync", href: "/device-sync", icon: RefreshCw },
  { label: "Users", href: "/users", icon: UserCog, roles: ["ADMIN"] },
];

/**
 * Normalises a pathname so matching is exact and independent of a trailing
 * slash (`/employees` and `/employees/` resolve to the same item).
 */
function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Deterministic route matching for the App Router: `usePathname()` returns the
 * full pathname (query string excluded), and this helper is a pure function of
 * it - so the server and the client always compute the same active item.
 *
 * A `null` pathname (router not initialised) deliberately matches nothing
 * rather than falling back to Home, which would highlight `/` on every route.
 */
function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;

  const current = normalizePathname(pathname);

  // The Home link is only active on the exact root path.
  if (href === "/") return current === "/";

  return current === href || current.startsWith(`${href}/`);
}

export function FloatingSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  /**
   * Clears the session cookie server-side, then returns to the login page.
   * On failure the user stays signed in rather than seeing a broken shell.
   */
  async function handleSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setSignOutFailed(false);

    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        setSignOutFailed(true);
        setIsSigningOut(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutFailed(true);
      setIsSigningOut(false);
    }
  }

  return (
    <aside className="fixed left-3 top-1/2 z-40 -translate-y-1/2 md:left-5">
      <div className="flex flex-col items-center gap-1.5 rounded-[28px] bg-gradient-to-b from-violet-600 via-violet-600 to-purple-700 p-2.5 shadow-[0_18px_40px_-12px_rgba(124,92,255,0.65)] ring-1 ring-white/20">



        <nav className="flex flex-col items-center gap-1.5">
          {NAV_ITEMS.filter((item) => {
            if (!item.roles) return true;
            return currentUser != null && item.roles.includes(currentUser.role);
          }).map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <motion.div
                key={item.label}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
                className="group relative"
              >
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-200 hover:bg-white/10 ${active ? "text-white" : "text-white/70 hover:text-white"
                    }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="glow-purple absolute inset-0 rounded-2xl bg-white/20"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="relative z-10" size={20} />
                </Link>

                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {item.label}
                </span>
              </motion.div>
            );
          })}
        </nav>

        <div aria-hidden className="my-1 h-px w-7 bg-white/20" />

        <motion.div
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          className="group relative"
        >
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? (
              <LoaderCircle className="relative z-10 animate-spin" size={20} />
            ) : (
              <LogOut className="relative z-10" size={20} />
            )}
          </button>

          <span
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {signOutFailed ? "Sign out failed" : "Sign out"}
          </span>
        </motion.div>
      </div>
    </aside>
  );
}
