"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { DashboardHeader } from "@/components/attendance/layout/DashboardHeader";
import { EmployeesTable } from "@/components/attendance/employees/EmployeesTable";
import { useEmployees, useShifts } from "@/hooks/attendance/useEmployees";
import { buildShiftLookup } from "@/lib/attendance/employee.utils";

export default function EmployeesPage() {
  const { employees, isLoading, error, refetch } = useEmployees();
  const { shifts } = useShifts();

  const shiftLookup = useMemo(() => buildShiftLookup(shifts), [shifts]);

  return (
    <>
      <DashboardHeader
        title="Employees"
        description="Browse the employee directory and open a profile for full details."
        actions={
          <div className="flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2.5 text-violet-700 ring-1 ring-inset ring-violet-100">
            <Users size={18} />
            <span className="text-sm font-semibold">
              {isLoading || error ? "—" : employees.length}
            </span>
            <span className="text-xs font-medium text-violet-500">
              employees
            </span>
          </div>
        }
      />

      <EmployeesTable
        employees={employees}
        shiftLookup={shiftLookup}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
      />
    </>
  );
}
