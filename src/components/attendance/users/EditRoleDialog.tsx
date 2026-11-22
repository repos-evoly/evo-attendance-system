"use client";

import { useEffect, useId, useState } from "react";
import { LoaderCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import type { UserAccount, UserRole } from "@/types/attendance/user.types";
import { ROLE_LABELS, USER_ROLES } from "@/types/attendance/user.types";
import { RolePermissionsPanel } from "@/components/attendance/users/RolePermissionsPanel";

interface EditRoleDialogProps {
  open: boolean;
  user: UserAccount | null;
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (role: UserRole) => void;
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

export function EditRoleDialog({ open, user, ...props }: EditRoleDialogProps) {
  if (!open || !user) return null;

  return <EditRoleDialogBody key={user.userId} user={user} {...props} />;
}

type EditRoleDialogBodyProps = Omit<EditRoleDialogProps, "open"> & {
  user: UserAccount;
};

function EditRoleDialogBody({
  user,
  isPending,
  error,
  onCancel,
  onSubmit,
}: EditRoleDialogBodyProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const fieldId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const hasChanged = role !== user.role;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change user role"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <ShieldAlert size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Change user role
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Update the system role for{" "}
          <span className="font-semibold text-slate-700">{user.username}</span>.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasChanged || isPending) return;
            onSubmit(role);
          }}
        >
          <label
            htmlFor={fieldId}
            className="text-xs font-semibold text-slate-600"
          >
            Role
          </label>
          <select
            id={fieldId}
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className={`${FIELD_CLASS} mt-0`}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} {r === "ADMIN" ? "(Full access)" : r === "HR" ? "(HR & Schedules)" : r === "MANAGER" ? "(Leaves & Waivers)" : "(Read-only)"}
              </option>
            ))}
          </select>

          <RolePermissionsPanel role={role} />

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600"
            >
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasChanged || isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <LoaderCircle size={14} className="animate-spin" />}
              Save role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
