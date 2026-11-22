"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Employee } from "@/types/attendance/employee.types";
import { EmployeeAvatar } from "./EmployeeAvatar";

interface EmployeeTableRowProps {
  employee: Employee;
  shiftLabel: string | null;
  index: number;
}

export function EmployeeTableRow({
  employee,
  shiftLabel,
  index,
}: EmployeeTableRowProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const href = `/employees/${employee.employeeId}`;

  const openDetails = () => router.push(href);

  return (
    <motion.tr
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.24),
      }}
      onClick={openDetails}
      className="group cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-violet-50/70"
    >
      <td className="py-3 pl-5 pr-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            fullName={employee.fullName}
            employeeId={employee.employeeId}
          />
          <div className="min-w-0">
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              className="block truncate font-medium text-slate-900 transition-colors hover:text-violet-600"
            >
              {employee.fullName}
            </Link>
            <p className="truncate text-xs text-slate-500 md:hidden">
              #{employee.employeeId}
            </p>
          </div>
        </div>
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 md:table-cell">
        #{employee.employeeId}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 lg:table-cell">
        {employee.department ?? "—"}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 lg:table-cell">
        {employee.jobTitle ?? "—"}
      </td>

      <td className="hidden py-3 pr-4 text-slate-600 xl:table-cell">
        {shiftLabel ?? "—"}
      </td>

      <td className="py-3 pr-4">
        <StatusPill isActive={employee.isActive} />
      </td>

      <td className="py-3 pr-5 text-right">
        <ArrowRight
          size={16}
          aria-hidden
          className="ml-auto text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500"
        />
      </td>
    </motion.tr>
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        isActive
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          isActive ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
