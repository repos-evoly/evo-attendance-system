"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import type { UserRole } from "@/types/attendance/user.types";
import { ROLE_LABELS } from "@/types/attendance/user.types";

/**
 * What each role can and cannot do, area by area. These descriptions mirror the
 * server-side `requireRole(...)` guards exactly and are informational only —
 * this panel never grants access on its own; the API remains the authority.
 */
const ROLE_PERMISSIONS: Record<
  UserRole,
  { can: string[]; cannot: string[] }
> = {
  ADMIN: {
    can: [
      "Dashboard — full access",
      "Employees — full access",
      "Attendance — full access",
      "Waivers — grant and revoke",
      "Leaves — create and cancel",
      "Public Holidays — manage",
      "Shift Assignments — manage",
      "User Management — manage users and roles",
      "Device Sync — run sync",
    ],
    cannot: [],
  },
  HR: {
    can: [
      "Dashboard — view",
      "Employees — view",
      "Attendance — view",
      "Waivers — grant and revoke",
      "Leaves — create and cancel",
      "Public Holidays — manage",
      "Shift Assignments — manage",
      "Device Sync — run sync",
    ],
    cannot: ["User Management — no access to user accounts or roles"],
  },
  MANAGER: {
    can: [
      "Dashboard — view",
      "Employees — view",
      "Attendance — view",
      "Waivers — grant and revoke",
      "Leaves — create and cancel",
    ],
    cannot: [
      "Public Holidays — cannot manage holidays",
      "Shift Assignments — cannot manage shift assignments",
      "User Management — no access to user accounts or roles",
      "Device Sync — cannot run sync",
    ],
  },
  VIEWER: {
    can: [
      "Dashboard — view",
      "Employees — view",
      "Attendance — view",
      "Waivers — view",
      "Leaves — view",
      "Public Holidays — view",
      "Shift Assignments — view",
    ],
    cannot: [
      "Waivers — cannot grant or revoke",
      "Leaves — cannot create or cancel",
      "Public Holidays — cannot manage",
      "Shift Assignments — cannot manage",
      "User Management — no access to user accounts or roles",
      "Device Sync — cannot run sync",
    ],
  },
};

interface RolePermissionsPanelProps {
  /** Role whose permissions are shown; the panel updates when this changes. */
  role: UserRole;
}

/** Live "Can do" / "Cannot do" summary for the selected role. */
export function RolePermissionsPanel({ role }: RolePermissionsPanelProps) {
  const { can, cannot } = ROLE_PERMISSIONS[role];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/60 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <ShieldCheck size={14} className="text-violet-600" />
        Permissions for {ROLE_LABELS[role]}
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            Can do
          </p>
          {can.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {can.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600"
                >
                  <Check
                    size={12}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-400">—</p>
          )}
        </section>

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
            Cannot do
          </p>
          {cannot.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {cannot.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600"
                >
                  <X size={12} className="mt-0.5 shrink-0 text-rose-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-400">
              No restrictions — full access to every area.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
