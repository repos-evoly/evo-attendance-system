
import { getDailyAttendance } from "@/server/modules/attendance/attendance.service";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today as YYYY-MM-DD using local date getters. */
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function resolveDate(
  value: string | string[] | undefined
): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  return candidate && DATE_PATTERN.test(candidate)
    ? candidate
    : todayLocalDate();
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PRESENT: "Present",
    LATE: "Late",
    IN_PROGRESS: "In Progress",
    MISSING_OUT: "Missing Check-Out",
    MISSING_IN: "Missing Check-In",
    PENDING: "Pending",
    ABSENT: "Absent",
    NO_SHIFT: "No Shift",
    WEEKEND: "Weekend",
  };

  return labels[status] ?? status;
}

function formatWorkedHours(
  minutes: number | null | undefined
): string {
  if (minutes == null) return "—";

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    remainingMinutes
  ).padStart(2, "0")}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const params = await searchParams;
  const date = resolveDate(params.date);

  const result = await getDailyAttendance(date);

  // The attendance service returns employees, not rows.
  const rows = result.employees.filter(
    (row) => row.fullName.trim().length > 0
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Attendance
      </h1>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label htmlFor="date" className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            id="date"
            name="date"
            defaultValue={date}
            className="rounded border border-black/15 px-2 py-1 dark:border-white/20"
          />
        </label>

        <button
          type="submit"
          className="rounded bg-foreground px-3 py-1 text-sm text-background"
        >
          View
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <p className="text-sm opacity-70">
          Daily attendance for {date}
        </p>

        {rows.length === 0 ? (
          <p className="text-sm opacity-70">
            No active employees found for this date.
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/15 dark:border-white/20">
                <th className="py-2 pr-4 font-medium">Employee ID</th>
                <th className="py-2 pr-4 font-medium">Employee Name</th>
                <th className="py-2 pr-4 font-medium">Check-in</th>
                <th className="py-2 pr-4 font-medium">Check-out</th>
                <th className="py-2 pr-4 font-medium">Worked Hours</th>
                <th className="py-2 pr-4 font-medium">Attendance Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.employeeId}
                  className="border-b border-black/5 dark:border-white/10"
                >
                  <td className="py-2 pr-4">{row.employeeId}</td>
                  <td className="py-2 pr-4">{row.fullName}</td>
                  <td className="py-2 pr-4">{row.checkIn ?? "—"}</td>
                  <td className="py-2 pr-4">{row.checkOut ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {formatWorkedHours(row.workedMinutes)}
                  </td>
                  <td className="py-2 pr-4">
                    {statusLabel(row.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
