import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { createLeave, listLeaves } from "@/server/modules/leave/leave.service";
import { isLeaveType } from "@/server/modules/leave/leave.types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real `YYYY-MM-DD` date (rejects e.g. 2026-02-31). */
function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** `GET /api/v1/leave?employeeId=<id>` - list leave records. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER", "VIEWER"]);
    if (!auth.ok) return auth.response;

    const employeeIdParam = request.nextUrl.searchParams.get("employeeId");
    let employeeId: number | undefined;

    if (employeeIdParam !== null) {
      if (!/^\d+$/.test(employeeIdParam)) {
        return NextResponse.json(
          { success: false, message: "Provide a valid employeeId." },
          { status: 400 },
        );
      }

      const parsed = Number(employeeIdParam);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { success: false, message: "Provide a valid employeeId." },
          { status: 400 },
        );
      }

      employeeId = parsed;
    }

    const leaves = await listLeaves(employeeId);

    return NextResponse.json({ success: true, data: leaves });
  } catch (error) {
    console.error("Leave list API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to retrieve leave records." },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/v1/leave` - create a leave record.
 *
 * Body: `{ employeeId, dateFrom, dateTo, leaveType, reason? }`.
 * `createdById` always comes from the verified session.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER"]);

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.user.userId;

    const body = (await request.json().catch(() => null)) as
      | {
          employeeId?: unknown;
          dateFrom?: unknown;
          dateTo?: unknown;
          leaveType?: unknown;
          reason?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    const { employeeId, dateFrom, dateTo, leaveType, reason } = body;

    if (
      typeof employeeId !== "number" ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Provide a valid employeeId." },
        { status: 400 },
      );
    }

    if (!isValidDate(dateFrom) || !isValidDate(dateTo)) {
      return NextResponse.json(
        {
          success: false,
          message: "Provide valid dateFrom and dateTo using YYYY-MM-DD.",
        },
        { status: 400 },
      );
    }

    if (dateTo < dateFrom) {
      return NextResponse.json(
        { success: false, message: "dateTo must be on or after dateFrom." },
        { status: 400 },
      );
    }

    if (!isLeaveType(leaveType)) {
      return NextResponse.json(
        {
          success: false,
          message: "leaveType must be VACATION, UNPAID or SICK_LEAVE.",
        },
        { status: 400 },
      );
    }

    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      return NextResponse.json(
        { success: false, message: "reason must be a string." },
        { status: 400 },
      );
    }

    const trimmedReason =
      typeof reason === "string" && reason.trim().length > 0
        ? reason.trim()
        : null;

    const result = await createLeave({
      employeeId,
      dateFrom,
      dateTo,
      leaveType,
      reason: trimmedReason,
      createdById: userId,
    });

    if (!result.ok) {
      const status =
        result.error.code === "EMPLOYEE_NOT_FOUND"
          ? 404
          : result.error.code === "OVERLAP"
            ? 409
            : 400;

      return NextResponse.json(
        { success: false, message: result.error.message },
        { status },
      );
    }

    if (result.attendanceRefresh.failedDates.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Leave was created, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.leave });
  } catch (error) {
    console.error("Leave create API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create the leave record." },
      { status: 500 },
    );
  }
}
