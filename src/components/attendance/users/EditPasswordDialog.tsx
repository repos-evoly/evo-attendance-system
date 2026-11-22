"use client";

import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, Key, LoaderCircle, TriangleExclamationPoint } from "lucide-react";
import type { UserAccount } from "@/types/attendance/user.types";

interface EditPasswordDialogProps {
  open: boolean;
  user: UserAccount | null;
  isPending: boolean;
  /** Validation or server error shown inside the dialog. */
  error: string | null;
  onCancel: () => void;
  /** Receives the validated password pair. */
  onSubmit: (newPassword: string, confirmPassword: string) => void;
}

/** Bounds mirroring the Users API and the `users` columns. */
const MAX_PASSWORD_LENGTH = 200;

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-violet-300";

/**
 * Dialog for editing a user's password.
 *
 * The administrator can change any user's password without knowing the old
 * password. The new password is hashed before storage.
 */
export function EditPasswordDialog({ open, user, ...props }: EditPasswordDialogProps) {
  if (!open) return null;

  return <EditPasswordDialogBody key={user?.userId} user={user} {...props} />;
}

type EditPasswordDialogBodyProps = Omit<EditPasswordDialogProps, "open">;

function EditPasswordDialogBody({
  user,
  isPending,
  error,
  onCancel,
  onSubmit,
}: EditPasswordDialogBodyProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const fieldId = useId();

  // Escape closes the dialog, matching the backdrop click.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const passwordTooLong = newPassword.length > MAX_PASSWORD_LENGTH;
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const canSubmit =
    !isPending &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !passwordTooLong &&
    passwordsMatch;

  if (!user) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit password"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <Key size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Edit password
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Change the password for <span className="font-medium text-slate-700">{user.username}</span>.
          The new password will be hashed before storage.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            onSubmit(newPassword, confirmPassword);
          }}
        >
          <label
            htmlFor={`${fieldId}-new-password`}
            className="text-xs font-semibold text-slate-600"
          >
            New Password
          </label>
          <div className="relative">
            <input
              id={`${fieldId}-new-password`}
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              placeholder="Enter new password"
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
          {newPassword.length === 0 && (
            <p className="text-xs text-rose-600">New password is required.</p>
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
            Confirm New Password
          </label>
          <div className="relative">
            <input
              id={`${fieldId}-confirm-password`}
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={MAX_PASSWORD_LENGTH}
              placeholder="Confirm the new password"
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
              <TriangleExclamationPoint size={14} className="mt-0.5 shrink-0" />
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
