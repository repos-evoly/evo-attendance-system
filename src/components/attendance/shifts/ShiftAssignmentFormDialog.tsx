"use client";

import { useEffect, useId, useState } from "react";
import { CalendarPlus, LoaderCircle, TriangleAlert } from "lucide-react";
import type { Employee, Shift } from "@/types/attendance/employee.types";
import type { CreateShiftAssignmentRequest } from "@/types/attendance/shift-assignment.types";
import { DATE_INPUT_CLASS } from "@/components/attendance/reports/ReportFilters";

interface ShiftAssignmentFormDialogProps {
  open: boolean;
  employees: Employee[];
  shifts: Shift[];
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateShiftAssignmentRequest) => void;
}

const FIELD_CLASS =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:ring-2 focus:ring-violet-300";

export function ShiftAssignmentFormDialog({
  open,
  ...props
}: ShiftAssignmentFormDialogProps) {
  if (!open) return null;

  return <ShiftAssignmentFormDialogBody {...props} />;
}

type ShiftAssignmentFormDialogBodyProps = Omit<
  ShiftAssignmentFormDialogProps,
  "open"
>;

function ShiftAssignmentFormDialogBody({
  employees,
  shifts,
  isPending,
  error,
  onCancel,
  onSubmit,
}: ShiftAssignmentFormDialogBodyProps) {
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [shiftId, setShiftId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fieldId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const rangeInvalid =
    startDate.length > 0 && endDate.length > 0 && endDate < startDate;

  const canSubmit =
    !isPending &&
    employeeId !== "" &&
    shiftId !== "" &&
    startDate.length > 0 &&
    !rangeInvalid;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign shift"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-5"
      >
        <div className="flex items-center gap-2 text-violet-700">
          <CalendarPlus size={18} />
          <h3 className="text-sm font-semibold text-slate-800">
            Assign shift to employee
          </h3>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Create a dated shift assignment. Overlapping assignments for the same
          employee are prevented.
        </p>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;

            onSubmit({
              employeeId: Number(employeeId),
              shiftId: Number(shiftId),
              startDate,
              endDate: endDate.trim().length > 0 ? endDate : null,
            });
          }}
        >
          <label
            htmlFor={`${fieldId}-employee`}
            className="text-xs font-semibold text-slate-600"
          >
            Employee
          </label>
          <select
            id={`${fieldId}-employee`}
            value={employeeId}
            onChange={(event) =>
              setEmployeeId(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            className={`${FIELD_CLASS} mt-0`}
          >
            <option value="">Select an employee…</option>
            {employees
              .filter((e) => e.isActive)
              .map((employee) => (
                <option key={employee.employeeId} value={employee.employeeId}>
                  {employee.fullName} (#{employee.employeeId})
                </option>
              ))}
          </select>

          <label
            htmlFor={`${fieldId}-shift`}
            className="text-xs font-semibold text-slate-600"
          >
            Shift
          </label>
          <select
            id={`${fieldId}-shift`}
            value={shiftId}
            onChange={(event) =>
              setShiftId(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            className={`${FIELD_CLASS} mt-0`}
          >
            <option value="">Select a shift…</option>
            {shifts.map((shift) => (
              <option key={shift.shiftId} value={shift.shiftId}>
                {shift.name} ({shift.allowanceMinutes}m allowance)
              </option>
            ))}
          </select>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-semibold text-slate-600">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </label>

            <label className="flex flex-col text-xs font-semibold text-slate-600">
              End date (optional)
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </label>
          </div>

          <p className="text-[11px] text-slate-400">
            Leaving end date empty marks the assignment as ongoing indefinitely.
          </p>

          {rangeInvalid && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <TriangleAlert size={13} />
              The end date cannot be earlier than the start date.
            </p>
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
              Assign shift
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
