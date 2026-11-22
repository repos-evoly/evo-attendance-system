"use client";

import { useState } from "react";
import { CalendarPlus, CircleCheck, X } from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { LeaveTable } from "@/components/attendance/leaves/LeaveTable";
import { LeaveFormDialog } from "@/components/attendance/leaves/LeaveFormDialog";
import { PublicHolidayTable } from "@/components/attendance/public-holidays/PublicHolidayTable";
import { PublicHolidayFormDialog } from "@/components/attendance/public-holidays/PublicHolidayFormDialog";
import { useCreateLeave, useLeaves } from "@/hooks/attendance/useLeaves";
import { useEmployees } from "@/hooks/attendance/useEmployees";
import {
  useCreatePublicHoliday,
  usePublicHolidays,
} from "@/hooks/attendance/usePublicHolidays";
import { useCurrentUser } from "@/hooks/attendance/useCurrentUser";
import type { CreateLeaveRequest } from "@/types/attendance/leave.types";
import type { CreatePublicHolidayRequest } from "@/types/attendance/public-holiday.types";

type Tab = "employee-leaves" | "public-holidays";

/**
 * Leave management page.
 *
 * Lists every leave record (active and cancelled) and lets a manager add an
 * approved leave or cancel an active one. Also manages public holidays.
 * Cancelling never deletes: the record is marked CANCELLED and keeps its
 * original fields plus the cancellation audit. Leaves are read from the
 * existing `GET /api/v1/leave`; new leaves go through the existing
 * `POST /api/v1/leave` with `createdById` resolved from the session on the server.
 */
export default function LeavesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("employee-leaves");
  const { currentUser } = useCurrentUser();

  const userRole = currentUser?.role;
  const canManageLeaves = userRole === "ADMIN" || userRole === "HR" || userRole === "MANAGER";
  const canManageHolidays = userRole === "ADMIN" || userRole === "HR";

  const { leaves, isLoading: isLeavesLoading, error: leavesError, refetch: refetchLeaves } = useLeaves();
  const {
    employees,
    isLoading: isEmployeesLoading,
    error: employeesError,
  } = useEmployees();
  const { createLeave, isPending: isCreatingLeave, error: createLeaveError } = useCreateLeave();

  const {
    holidays,
    isLoading: isHolidaysLoading,
    error: holidaysError,
    refetch: refetchHolidays,
  } = usePublicHolidays();
  const {
    createHoliday,
    isPending: isCreatingHoliday,
    error: createHolidayError,
  } = useCreatePublicHoliday();

  const [isLeaveFormOpen, setLeaveFormOpen] = useState(false);
  const [isHolidayFormOpen, setHolidayFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeCount = leaves.filter((leave) => leave.status === "ACTIVE").length;
  const activeHolidayCount = holidays.filter((holiday) => holiday.cancelledAt === null).length;
  const cancelledHolidayCount = holidays.filter((holiday) => holiday.cancelledAt !== null).length;

  function handleLeaveSubmit(input: CreateLeaveRequest) {
    createLeave(input, () => {
      setLeaveFormOpen(false);
      setSuccessMessage("Leave added successfully.");
      refetchLeaves();
    });
  }

  function handleHolidaySubmit(input: CreatePublicHolidayRequest) {
    createHoliday(input, () => {
      setHolidayFormOpen(false);
      setSuccessMessage("Public holiday added successfully.");
      refetchHolidays();
    });
  }

  return (
    <>
      <DashboardHeader
        title="Leaves"
        description="Review approved leave, add a new leave and cancel an active one. Also manage public holidays."
        breadcrumbs={[{ label: "Leaves" }]}
        actions={
          activeTab === "employee-leaves" ? (
            canManageLeaves ? (
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage(null);
                  setLeaveFormOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
              >
                <CalendarPlus size={18} />
                Add leave
              </button>
            ) : null
          ) : (
            canManageHolidays ? (
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage(null);
                  setHolidayFormOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
              >
                <CalendarPlus size={18} />
                Add holiday
              </button>
            ) : null
          )
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("employee-leaves")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "employee-leaves"
              ? "border-b-2 border-violet-600 text-violet-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Employee Leaves
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("public-holidays")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "public-holidays"
              ? "border-b-2 border-violet-600 text-violet-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Public Holidays
        </button>
      </div>

      {/* Employee Leaves Tab */}
      {activeTab === "employee-leaves" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700 ring-1 ring-inset ring-violet-100">
              {isLeavesLoading || leavesError ? "—" : leaves.length} total
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-100">
              {isLeavesLoading || leavesError ? "—" : activeCount} active
            </span>
          </div>

          <LeaveTable
            leaves={leaves}
            isLoading={isLeavesLoading}
            error={leavesError}
            canManage={canManageLeaves}
            onRetry={refetchLeaves}
            onChanged={refetchLeaves}
          />

          <LeaveFormDialog
            open={isLeaveFormOpen}
            employees={employees}
            isPending={isCreatingLeave || isEmployeesLoading}
            error={createLeaveError ?? employeesError}
            onCancel={() => setLeaveFormOpen(false)}
            onSubmit={handleLeaveSubmit}
          />
        </>
      )}

      {/* Public Holidays Tab */}
      {activeTab === "public-holidays" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700 ring-1 ring-inset ring-violet-100">
              {isHolidaysLoading || holidaysError ? "—" : holidays.length} total
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-100">
              {isHolidaysLoading || holidaysError ? "—" : activeHolidayCount} active
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-inset ring-rose-100">
              {isHolidaysLoading || holidaysError ? "—" : cancelledHolidayCount} cancelled
            </span>
          </div>

          <PublicHolidayTable
            holidays={holidays}
            isLoading={isHolidaysLoading}
            error={holidaysError}
            canManage={canManageHolidays}
            onRetry={refetchHolidays}
            onChanged={refetchHolidays}
          />

          <PublicHolidayFormDialog
            open={isHolidayFormOpen}
            isPending={isCreatingHoliday}
            error={createHolidayError}
            onCancel={() => setHolidayFormOpen(false)}
            onSubmit={handleHolidaySubmit}
          />
        </>
      )}
    </>
  );
}
