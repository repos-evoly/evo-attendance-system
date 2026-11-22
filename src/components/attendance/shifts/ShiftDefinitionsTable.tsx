"use client";

import type { Shift } from "@/types/attendance/employee.types";
import {
  ReportEmptyState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

interface ShiftDefinitionsTableProps {
  shifts: Shift[];
  isLoading: boolean;
}

/** Formats ISO string (e.g., 1970-01-01T09:00:00.000Z) or HH:mm string to HH:mm */
function formatTime(timeStr: string): string {
  if (!timeStr) return "—";
  if (timeStr.includes("T")) {
    return timeStr.slice(11, 16);
  }
  return timeStr.slice(0, 5);
}

/**
 * Read-only table showing existing shift definitions.
 */
export function ShiftDefinitionsTable({
  shifts,
  isLoading,
}: ShiftDefinitionsTableProps) {
  return (
    <div className="glass-card overflow-hidden rounded-3xl">
      {isLoading ? (
        <ReportLoadingState message="Loading shifts…" />
      ) : shifts.length === 0 ? (
        <ReportEmptyState
          title="No shifts defined"
          message="Configured shifts will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3.5 pl-5 pr-4 font-semibold">Shift Name</th>
                <th className="py-3.5 pr-4 font-semibold">Time In</th>
                <th className="py-3.5 pr-4 font-semibold">Time Out</th>
                <th className="py-3.5 pr-5 font-semibold">Allowance</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr
                  key={shift.shiftId}
                  className="border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
                >
                  <td className="py-3.5 pl-5 pr-4">
                    <div className="font-medium text-slate-900">{shift.name}</div>
                    <div className="text-xs text-slate-400">#{shift.shiftId}</div>
                  </td>
                  <td className="py-3.5 pr-4 text-slate-600 font-mono text-xs">
                    {formatTime(shift.timeIn)}
                  </td>
                  <td className="py-3.5 pr-4 text-slate-600 font-mono text-xs">
                    {formatTime(shift.timeOut)}
                  </td>
                  <td className="py-3.5 pr-5 text-slate-600">
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {shift.allowanceMinutes} mins
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
