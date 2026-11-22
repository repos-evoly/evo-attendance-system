"use client";

import { useState } from "react";
import { CircleCheck, Clock, Plus, X } from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { ShiftDefinitionsTable } from "@/components/attendance/shifts/ShiftDefinitionsTable";
import { ShiftAssignmentTable } from "@/components/attendance/shifts/ShiftAssignmentTable";
import { ShiftAssignmentFormDialog } from "@/components/attendance/shifts/ShiftAssignmentFormDialog";
import { ShiftAssignmentEditDialog } from "@/components/attendance/shifts/ShiftAssignmentEditDialog";
import { useEmployees, useShifts } from "@/hooks/attendance/useEmployees";
import { useCurrentUser } from "@/hooks/attendance/useCurrentUser";
import {
  useCreateShiftAssignment,
  useShiftAssignments,
  useUpdateShiftAssignment,
} from "@/hooks/attendance/useShiftAssignments";
import type {
  CreateShiftAssignmentRequest,
  ShiftAssignment,
  UpdateShiftAssignmentRequest,
} from "@/types/attendance/shift-assignment.types";

type Tab = "shift-definitions" | "shift-assignments";

/**
 * Shift Management page.
 *
 * Provides two tabs:
 * 1. Shift Definitions (read-only listing of shifts).
 * 2. Shift Assignments (create, edit, and filter employee shift assignments).
 */
export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("shift-assignments");
  const { currentUser } = useCurrentUser();
  const canManageShifts = currentUser?.role === "ADMIN" || currentUser?.role === "HR";

  const { shifts, isLoading: isShiftsLoading } = useShifts();
  const { employees } = useEmployees();
  const {
    assignments,
    isLoading: isAssignmentsLoading,
    error: assignmentsError,
    refetch: refetchAssignments,
  } = useShiftAssignments();

  const {
    createAssignment,
    isPending: isCreatingAssignment,
    error: createAssignmentError,
  } = useCreateShiftAssignment();

  const {
    updateAssignment,
    isPending: isUpdatingAssignment,
    error: updateAssignmentError,
  } = useUpdateShiftAssignment();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignment | null>(
    null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleCreateSubmit(input: CreateShiftAssignmentRequest) {
    createAssignment(input, () => {
      setCreateOpen(false);
      setSuccessMessage("Shift assigned successfully.");
      refetchAssignments();
    });
  }

  function handleEditSubmit(id: string, input: UpdateShiftAssignmentRequest) {
    updateAssignment(id, input, () => {
      setEditingAssignment(null);
      setSuccessMessage("Shift assignment updated successfully.");
      refetchAssignments();
    });
  }

  return (
    <>
      <DashboardHeader
        title="Shift Management"
        description="View defined work shifts and manage dated employee shift assignments."
        breadcrumbs={[{ label: "Shifts" }]}
        actions={
          activeTab === "shift-assignments" ? (
            canManageShifts ? (
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage(null);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 active:scale-[0.98]"
              >
                <Plus size={18} />
                Assign shift
              </button>
            ) : null
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-violet-700 ring-1 ring-inset ring-violet-100">
                <Clock size={14} />
                {isShiftsLoading ? "—" : shifts.length} shift definitions
              </span>
            </div>
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
          onClick={() => setActiveTab("shift-assignments")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "shift-assignments"
              ? "border-b-2 border-violet-600 text-violet-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Shift Assignments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("shift-definitions")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "shift-definitions"
              ? "border-b-2 border-violet-600 text-violet-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Shift Definitions
        </button>
      </div>

      {/* Shift Assignments Tab */}
      {activeTab === "shift-assignments" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700 ring-1 ring-inset ring-violet-100">
              {isAssignmentsLoading || assignmentsError
                ? "—"
                : assignments.length}{" "}
              total assignments
            </span>
          </div>

          <ShiftAssignmentTable
            assignments={assignments}
            shifts={shifts}
            isLoading={isAssignmentsLoading}
            error={assignmentsError}
            canEdit={canManageShifts}
            onRetry={refetchAssignments}
            onEdit={(assignment) => {
              setSuccessMessage(null);
              setEditingAssignment(assignment);
            }}
          />

          <ShiftAssignmentFormDialog
            open={isCreateOpen}
            employees={employees}
            shifts={shifts}
            isPending={isCreatingAssignment}
            error={createAssignmentError}
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreateSubmit}
          />

          <ShiftAssignmentEditDialog
            open={editingAssignment !== null}
            assignment={editingAssignment}
            shifts={shifts}
            isPending={
              editingAssignment ? isUpdatingAssignment(editingAssignment.id) : false
            }
            error={updateAssignmentError}
            onCancel={() => setEditingAssignment(null)}
            onSubmit={handleEditSubmit}
          />
        </>
      )}

      {/* Shift Definitions Tab */}
      {activeTab === "shift-definitions" && (
        <ShiftDefinitionsTable shifts={shifts} isLoading={isShiftsLoading} />
      )}
    </>
  );
}
