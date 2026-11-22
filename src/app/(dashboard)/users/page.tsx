"use client";

import { useState } from "react";
import { CircleCheck, ShieldX, UserPlus, X } from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { UserTable } from "@/components/attendance/users/UserTable";
import { UserFormDialog } from "@/components/attendance/users/UserFormDialog";
import { EditPasswordDialog } from "@/components/attendance/users/EditPasswordDialog";
import { EditRoleDialog } from "@/components/attendance/users/EditRoleDialog";
import { ConfirmDialog } from "@/components/attendance/shared/ConfirmDialog";
import {
  useCreateUser,
  useUsers,
  useUpdatePassword,
  useUpdateRole,
  useUpdateStatus,
} from "@/hooks/attendance/useUsers";
import { useCurrentUser } from "@/hooks/attendance/useCurrentUser";
import type {
  CreateUserRequest,
  UserAccount,
  UserRole,
} from "@/types/attendance/user.types";

/**
 * Users Management page.
 *
 * Restricted to the ADMIN role.
 * Lists all system accounts, allowing admins to add users, edit passwords,
 * toggle active status, and modify user roles.
 */
export default function UsersPage() {
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { users, isLoading, error, refetch } = useUsers();
  const { createUser, isPending: createPending, error: createError } = useCreateUser();
  const { updateUserPassword, isPending: isPasswordPending, error: passwordError } = useUpdatePassword();
  const { updateUserStatus, isPending: isStatusPending, error: statusError } = useUpdateStatus();
  const { updateUserRole, isPending: isRolePending, error: roleError } = useUpdateRole();

  const [isFormOpen, setFormOpen] = useState(false);
  const [isPasswordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isRoleDialogOpen, setRoleDialogOpen] = useState(false);
  const [isConfirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isUserLoading && currentUser && currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldX size={28} />
        </span>
        <h2 className="text-lg font-semibold text-slate-800">Access Denied</h2>
        <p className="max-w-sm text-sm text-slate-500">
          User account management is strictly restricted to system administrators.
        </p>
      </div>
    );
  }

  function handleCreateUser(input: CreateUserRequest) {
    createUser(input, () => {
      setFormOpen(false);
      setSuccessMessage("User account created successfully.");
      refetch();
    });
  }

  function handleEditPassword(user: UserAccount) {
    setSelectedUser(user);
    setPasswordDialogOpen(true);
    setSuccessMessage(null);
  }

  function handleEditRole(user: UserAccount) {
    setSelectedUser(user);
    setRoleDialogOpen(true);
    setSuccessMessage(null);
  }

  function handlePasswordSubmit(newPassword: string, confirmPassword: string) {
    if (!selectedUser) return;

    updateUserPassword(selectedUser.userId, { newPassword, confirmPassword }, () => {
      setPasswordDialogOpen(false);
      setSelectedUser(null);
      setSuccessMessage("Password updated successfully.");
      refetch();
    });
  }

  function handleRoleSubmit(newRole: UserRole) {
    if (!selectedUser) return;

    updateUserRole(selectedUser.userId, { role: newRole }, () => {
      setRoleDialogOpen(false);
      setSelectedUser(null);
      setSuccessMessage(`Role updated to ${newRole} for ${selectedUser.username}.`);
      refetch();
    });
  }

  function handleToggleStatus(user: UserAccount) {
    setSelectedUser(user);
    setConfirmDialogOpen(true);
    setSuccessMessage(null);
  }

  function handleStatusConfirm() {
    if (!selectedUser) return;

    updateUserStatus(selectedUser.userId, { isActive: !selectedUser.isActive }, () => {
      setConfirmDialogOpen(false);
      setSelectedUser(null);
      setSuccessMessage(
        `Account ${selectedUser.isActive ? "deactivated" : "activated"} successfully.`
      );
      refetch();
    });
  }

  return (
    <>
      <DashboardHeader
        title="Users"
        description="Manage system accounts, passwords, and assigned roles."
        breadcrumbs={[{ label: "Settings" }, { label: "Users" }]}
        actions={
          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline-flex items-center rounded-2xl bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-100">
              {isLoading || error ? "—" : users.length} total accounts
            </span>
            <button
              type="button"
              onClick={() => {
                setSuccessMessage(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 active:scale-[0.98]"
            >
              <UserPlus size={18} />
              Add user
            </button>
          </div>
        }
      />

      {successMessage && (
        <div
          role="status"
          className="glass-card flex items-center justify-between gap-3 rounded-2xl border-l-4 border-l-emerald-400 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-emerald-700">
            <CircleCheck size={18} />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            aria-label="Dismiss"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <UserTable
        users={users}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        currentUserId={currentUser?.userId}
        activeAdminCount={currentUser?.activeAdminCount}
        onEditPassword={handleEditPassword}
        onEditRole={handleEditRole}
        onToggleStatus={handleToggleStatus}
      />

      <UserFormDialog
        open={isFormOpen}
        isPending={createPending}
        error={createError}
        onCancel={() => setFormOpen(false)}
        onSubmit={handleCreateUser}
      />

      <EditPasswordDialog
        open={isPasswordDialogOpen}
        user={selectedUser}
        isPending={selectedUser ? isPasswordPending(selectedUser.userId) : false}
        error={passwordError}
        onCancel={() => {
          setPasswordDialogOpen(false);
          setSelectedUser(null);
        }}
        onSubmit={handlePasswordSubmit}
      />

      <EditRoleDialog
        open={isRoleDialogOpen}
        user={selectedUser}
        isPending={selectedUser ? isRolePending(selectedUser.userId) : false}
        error={roleError}
        onCancel={() => {
          setRoleDialogOpen(false);
          setSelectedUser(null);
        }}
        onSubmit={handleRoleSubmit}
      />

      <ConfirmDialog
        open={isConfirmDialogOpen}
        title={selectedUser?.isActive ? "Deactivate account" : "Activate account"}
        message={
          selectedUser?.isActive
            ? `Are you sure you want to deactivate ${selectedUser?.username ?? "this user"}? They will not be able to log in.`
            : `Are you sure you want to activate ${selectedUser?.username ?? "this user"}? They will be able to log in again.`
        }
        confirmLabel={selectedUser?.isActive ? "Deactivate" : "Activate"}
        isPending={selectedUser ? isStatusPending(selectedUser.userId) : false}
        tone={selectedUser?.isActive ? "danger" : "primary"}
        error={statusError}
        onCancel={() => {
          setConfirmDialogOpen(false);
          setSelectedUser(null);
        }}
        onConfirm={handleStatusConfirm}
      />
    </>
  );
}
