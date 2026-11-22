"use client";

import { useState, useMemo } from "react";
import {
  Key,
  Search,
  Check,
  X,
  UserX,
  UserCheck,
  ShieldAlert,
} from "lucide-react";
import type { UserAccount, UserRole } from "@/types/attendance/user.types";
import { ROLE_LABELS, USER_ROLES } from "@/types/attendance/user.types";
import { formatDateTime } from "@/lib/attendance/attendance.utils";
import {
  ReportEmptyState,
  ReportErrorState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

interface UserTableProps {
  users: UserAccount[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  currentUserId?: string;
  activeAdminCount?: number;
  onEditPassword: (user: UserAccount) => void;
  onEditRole: (user: UserAccount) => void;
  onToggleStatus: (user: UserAccount) => void;
}

type StatusFilter = "all" | "active" | "inactive";
type RoleFilter = "all" | UserRole;

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never logged in";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? "minute" : "minutes"} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? "hour" : "hours"} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "Yesterday";
  if (diffInDays < 7) return `${diffInDays} days ago`;

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInDays < 30) return `${diffInWeeks} ${diffInWeeks === 1 ? "week" : "weeks"} ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInDays < 365) return `${diffInMonths} ${diffInMonths === 1 ? "month" : "months"} ago`;

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} ${diffInYears === 1 ? "year" : "years"} ago`;
}

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    ADMIN: "bg-purple-50 text-purple-700 ring-purple-200/60",
    HR: "bg-blue-50 text-blue-700 ring-blue-200/60",
    MANAGER: "bg-amber-50 text-amber-700 ring-amber-200/60",
    VIEWER: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        styles[role] ?? styles.VIEWER
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function UserTable({
  users,
  isLoading,
  error,
  onRetry,
  currentUserId,
  activeAdminCount = 1,
  onEditPassword,
  onEditRole,
  onToggleStatus,
}: UserTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const counts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const user of users) {
      if (user.isActive) {
        active++;
      } else {
        inactive++;
      }
    }
    return {
      all: users.length,
      active,
      inactive,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        query === "" || user.username.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.isActive) ||
        (statusFilter === "inactive" && !user.isActive);

      const matchesRole =
        roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  const getInitials = (username: string) => {
    return username
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isFiltering =
    searchQuery.trim() !== "" || statusFilter !== "all" || roleFilter !== "all";

  return (
    <section className="glass-card overflow-hidden rounded-3xl">
      {isLoading ? (
        <ReportLoadingState message="Loading user accounts…" />
      ) : error ? (
        <ReportErrorState message={error} onRetry={onRetry} />
      ) : (
        <>
          {/* Search and Filter Controls */}
          <div className="flex flex-col gap-3 border-b border-slate-200/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Compact Search Input */}
              <div className="relative w-full sm:w-64 md:w-72">
                <Search
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/80 bg-white/80 py-2 pl-9 pr-8 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-200"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Filters with Accounts Count */}
              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/50">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === "all"
                      ? "bg-white font-semibold text-violet-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>All</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      statusFilter === "all"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {counts.all}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === "active"
                      ? "bg-white font-semibold text-emerald-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>Active</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      statusFilter === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {counts.active}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("inactive")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                    statusFilter === "inactive"
                      ? "bg-white font-semibold text-slate-800 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>Inactive</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      statusFilter === "inactive"
                        ? "bg-slate-200 text-slate-700"
                        : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {counts.inactive}
                  </span>
                </button>
              </div>

              {/* Role Filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-200"
              >
                <option value="all">All roles</option>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            {/* Matching filter count */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              {isFiltering && (
                <span>
                  Showing <span className="font-semibold text-slate-700">{filteredUsers.length}</span> of {users.length} accounts
                </span>
              )}
            </div>
          </div>

          {users.length === 0 ? (
            <ReportEmptyState
              title="No user accounts found"
              message="Accounts created here will appear in this list."
            />
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
                <Search size={22} />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  No matching user accounts
                </p>
                <p className="max-w-xs text-xs text-slate-500">
                  Try checking for typos or resetting your search and filters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setRoleFilter("all");
                }}
                className="mt-1 rounded-xl bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th scope="col" className="w-[30%] min-w-[180px] py-3.5 pl-6 pr-4">User</th>
                    <th scope="col" className="w-[15%] min-w-[100px] py-3.5 px-4">Role</th>
                    <th scope="col" className="w-[12%] min-w-[90px] py-3.5 px-4">Status</th>
                    <th scope="col" className="w-[20%] min-w-[130px] py-3.5 px-4">Last Login</th>
                    <th scope="col" className="w-[13%] min-w-[110px] py-3.5 px-4">Created At</th>
                    <th scope="col" className="w-[10%] min-w-[100px] py-3.5 pl-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const isCurrentUser = Boolean(currentUserId && user.userId === currentUserId);
                    const isOnlyAdmin = user.role === "ADMIN" && activeAdminCount <= 1 && user.isActive;
                    const isDeactivateRestricted =
                      user.isActive && (isCurrentUser || isOnlyAdmin);

                    const restrictedDeactivateTooltip = isCurrentUser
                      ? "Cannot deactivate your own account"
                      : "Cannot deactivate the only active administrator";

                    const isRoleChangeRestricted =
                      (isCurrentUser && user.role === "ADMIN") || isOnlyAdmin;

                    const restrictedRoleTooltip = isCurrentUser
                      ? "Cannot demote your own administrator role"
                      : "Cannot demote the only active administrator";

                    return (
                      <tr
                        key={user.userId}
                        className="transition-colors duration-150 hover:bg-violet-50/60"
                      >
                        <td className="py-3.5 pl-6 pr-4">
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-semibold text-white shadow-xs"
                            >
                              {getInitials(user.username)}
                            </span>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate font-medium text-slate-900">
                                {user.username}
                              </span>
                              {isCurrentUser && (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <RoleBadge role={user.role} />
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {user.isActive ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200/60">
                              <Check size={12} className="mr-1" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                              <X size={12} className="mr-1" />
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {user.lastLoginAt ? (
                            <div className="group relative inline-flex items-center">
                              <span
                                title={formatDateTime(user.lastLoginAt)}
                                className="cursor-default underline decoration-slate-300 decoration-dotted underline-offset-2 transition-colors hover:text-slate-900"
                              >
                                {formatRelativeTime(user.lastLoginAt)}
                              </span>
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100"
                              >
                                {formatDateTime(user.lastLoginAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-slate-400">
                              Never logged in
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {formatDateTime(user.createdAt)}
                        </td>

                        <td className="py-3.5 pl-4 pr-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* Change Role Button */}
                            <div className="group relative inline-flex">
                              {isRoleChangeRestricted ? (
                                <button
                                  type="button"
                                  disabled
                                  aria-label={restrictedRoleTooltip}
                                  title={restrictedRoleTooltip}
                                  className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-xl text-slate-300 opacity-35"
                                >
                                  <ShieldAlert size={15} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onEditRole(user)}
                                  aria-label={`Change role for ${user.username}`}
                                  title="Change role"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-violet-100/70 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                                >
                                  <ShieldAlert size={15} />
                                </button>
                              )}
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                              >
                                {isRoleChangeRestricted ? restrictedRoleTooltip : "Change role"}
                              </span>
                            </div>

                            {/* Edit Password Button */}
                            <div className="group relative inline-flex">
                              <button
                                type="button"
                                onClick={() => onEditPassword(user)}
                                aria-label={`Edit password for ${user.username}`}
                                title="Edit password"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-violet-100/70 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                              >
                                <Key size={15} />
                              </button>
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                              >
                                Edit password
                              </span>
                            </div>

                            {/* Activate / Deactivate Button */}
                            {user.isActive ? (
                              isDeactivateRestricted ? (
                                <div className="group relative inline-flex">
                                  <button
                                    type="button"
                                    disabled
                                    aria-label={restrictedDeactivateTooltip}
                                    title={restrictedDeactivateTooltip}
                                    className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-xl text-slate-300 opacity-35"
                                  >
                                    <UserX size={15} />
                                  </button>
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100"
                                  >
                                    {restrictedDeactivateTooltip}
                                  </span>
                                </div>
                              ) : (
                                <div className="group relative inline-flex">
                                  <button
                                    type="button"
                                    onClick={() => onToggleStatus(user)}
                                    aria-label={`Deactivate account ${user.username}`}
                                    title="Deactivate account"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                  >
                                    <UserX size={15} />
                                  </button>
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                                  >
                                    Deactivate account
                                  </span>
                                </div>
                              )
                            ) : (
                              <div className="group relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() => onToggleStatus(user)}
                                  aria-label={`Activate account ${user.username}`}
                                  title="Activate account"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                                >
                                  <UserCheck size={15} />
                                </button>
                                <span
                                  role="tooltip"
                                  className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                                >
                                  Activate account
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
