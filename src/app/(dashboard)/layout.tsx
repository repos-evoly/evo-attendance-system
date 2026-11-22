import type { ReactNode } from "react";
import { DashboardLayout } from "@/components/attendance/layout/DashboardLayout";

/**
 * Route group shell for dashboard pages. The group name is in parentheses, so
 * it does not affect the URL: `employees/page.tsx` still resolves to
 * `/employees`.
 */
export default function DashboardGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
