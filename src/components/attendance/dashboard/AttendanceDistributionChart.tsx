"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartPie } from "lucide-react";
import type { DailyAttendanceSummary } from "@/types/attendance/daily-attendance.types";
import {
  ReportEmptyState,
  ReportLoadingState,
} from "@/components/attendance/shared/ReportStates";

interface SliceDefinition {
  key: keyof Pick<
    DailyAttendanceSummary,
    "attending" | "late" | "absent" | "onLeave"
  >;
  label: string;
  color: string;
}

const SLICES: readonly SliceDefinition[] = [
  { key: "attending", label: "On Time", color: "#10b981" },
  { key: "late", label: "Late", color: "#f59e0b" },
  { key: "absent", label: "Absent", color: "#f43f5e" },
  { key: "onLeave", label: "On Leave", color: "#8b5cf6" },
];

interface AttendanceDistributionChartProps {
  summary: DailyAttendanceSummary | null;
  isLoading: boolean;
}

/**
 * Donut chart of today's attendance statuses, built from the daily API
 * summary (no recalculation on the client).
 */
export function AttendanceDistributionChart({
  summary,
  isLoading,
}: AttendanceDistributionChartProps) {
  /**
   * Only used for the Recharts prop below. Recharts renders inside
   * `ResponsiveContainer`, which emits no chart markup while server rendering,
   * so this never influences the server HTML. Framer Motion props are kept
   * constant and let `MotionConfig reducedMotion="user"` handle the preference.
   */
  const reduceMotion = useReducedMotion();

  const data = useMemo(
    () =>
      SLICES.map((slice) => {
        const value = summary ? summary[slice.key] : 0;
        // On Time = Attending minus Late (mutually exclusive slices)
        const adjustedValue = slice.key === "attending" && summary
          ? Math.max(0, summary.attending - summary.late)
          : value;
        return {
          name: slice.label,
          value: adjustedValue,
          color: slice.color,
        };
      }).filter((entry) => entry.value > 0),
    [summary]
  );

  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const description = data
    .map((entry) => `${entry.name}: ${entry.value}`)
    .join(", ");

  return (
    <section className="glass-card flex flex-col rounded-3xl p-5 md:p-6">
      <div className="flex items-center gap-2 text-violet-700">
        <ChartPie size={18} />
        <h2 className="text-sm font-semibold text-slate-800">
          Attendance distribution
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Today&apos;s statuses across all scheduled employees.
      </p>

      <div className="mt-4 flex-1">
        {isLoading ? (
          <ReportLoadingState message="Loading distribution…" />
        ) : total === 0 ? (
          <ReportEmptyState
            title="No attendance recorded yet"
            message="Statuses will appear here once today's punches are processed."
          />
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <div
              role="img"
              aria-label={`Attendance distribution. ${description}`}
              className="h-56"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive={!reduceMotion}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 14,
                      border: "1px solid rgb(226 232 240)",
                      boxShadow: "0 8px 30px rgba(99, 102, 241, 0.12)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="flex flex-col gap-2.5">
              {data.map((entry, index) => (
                <motion.li
                  key={entry.name}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2 text-slate-600">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {entry.value}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
