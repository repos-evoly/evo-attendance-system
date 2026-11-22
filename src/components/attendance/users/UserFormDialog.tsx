"use client";

import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert, UserPlus } from "lucide-react";
import type { CreateUserRequest, UserRole } from "@/types/attendance/user.types";
import { ROLE_LABELS, USER_ROLES } from "@/types/attendance/user.types";
import { RolePermissionsPanel } from "@/components/attendance/users/RolePermissionsPanel";

interface UserFormDialogProps {
  open: boolean;
  isPending: boolean;
  /** Validation or server error shown inside the dialog. */
  error: string | null;
  onCancel: () => void;
  /** Receives the validated user creation payload. */
  onSubmit: (input: CreateUserRequest) => void;
}

const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 200;

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

export function UserFormDialog({ open, ...props }: UserFormDialogProps) {
  if (!open) return null;

  return <UserFormDialogBody {...props} />;
}

type UserFormDialogBodyProps = Omit<UserFormDialogProps, "open">;

function UserFormDialogBody({
  isPending,
  error,
  onCancel,
  onSubmit,
}: UserFormDialogBodyProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("VIEWER");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const fieldId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const trimmedUsername = username.trim();
  const usernameTooLong = trimmedUsername.length > MAX_USERNAME_LENGTH;
  const passwordTooLong = password.length > MAX_PASSWORD_LENGTH;
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const canSubmit =
    !isPending &&
    trimmedUsername.length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    !usernameTooLong &&
    !passwordTooLong &&
    passwordsMatch;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create user account"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <UserPlus size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Create user account
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          The account is created with the chosen role, username, and password.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            onSubmit({
              username: trimmedUsername,
              password,
              confirmPassword,
              role,
            });
          }}
        >
          <label
            htmlFor={`${fieldId}-username`}
            className="text-xs font-semibold text-slate-600"
          >
            Username
          </label>
          <input
            id={`${fieldId}-username`}
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            autoComplete="off"
            maxLength={MAX_USERNAME_LENGTH}
            placeholder="e.g. aisha"
            className={`${FIELD_CLASS} mt-0`}
          />
          {trimmedUsername.length === 0 && (
            <p className="text-xs text-rose-600">Username is required.</p>
          )}
          {usernameTooLong && (
            <p className="text-xs text-rose-600">
              Username must be at most {MAX_USERNAME_LENGTH} characters.
            </p>
          )}

          <label
            htmlFor={`${fieldId}-role`}
            className="text-xs font-semibold text-slate-600"
          >
            System Role
          </label>
          <select
            id={`${fieldId}-role`}
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

          <label
            htmlFor={`${fieldId}-password`}
            className="text-xs font-semibold text-slate-600"
          >
            Password
          </label>
          <div className="relative">
            <input
              id={`${fieldId}-password`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              placeholder="Password for the new account"
              className={`${FIELD_CLASS} mt-0 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {password.length === 0 && (
            <p className="text-xs text-rose-600">Password is required.</p>
          )}
          {passwordTooLong && (
            <p className="text-xs text-rose-600">
              Password must be at most {MAX_PASSWORD_LENGTH} characters.
            </p>
          )}

          <label
            htmlFor={`${fieldId}-confirm-password`}
            className="text-xs font-semibold text-slate-600"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id={`${fieldId}-confirm-password`}
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              placeholder="Confirm the password"
              className={`${FIELD_CLASS} mt-0 pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword.length === 0 && (
            <p className="text-xs text-rose-600">Please confirm your password.</p>
          )}
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-rose-600">Passwords do not match.</p>
          )}

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
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending && <LoaderCircle size={14} className="animate-spin" />}
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
