import { NextRequest, NextResponse } from "next/server";
import { setDailyAttendanceWaiver } from "@/server/modules/attendance/attendance.service";
import { requireRole } from "@/server/modules/auth/session-user";

/** Longest accepted waiver reason. */
const MAX_REASON_LENGTH = 500;

/**
 * Enables or revokes the existing `attendance.waiver` flag for one employee/day.
 *
 * Granting requires a reason and the acting user is read from the verified
 * session - a client-supplied user id is never trusted. The flag and the
 * `waivers` audit row are written in one transaction.
 *
 * This is the only mutation the attendance module exposes. It never creates or
 * modifies device punches: it only flips the stored waiver flag that the daily
 * and monthly calculators read.
 *
 * Body: `{ employeeId: number, date: "YYYY-MM-DD", waiver: boolean, reason?: string }`
 * (`reason` is required when `waiver` is true.)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          employeeId?: unknown;
          date?: unknown;
          waiver?: unknown;
          reason?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    const employeeId = body.employeeId;
    const date = body.date;
    const waiver = body.waiver;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

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

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid date using YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid date." },
        { status: 400 },
      );
    }

    if (typeof waiver !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Provide a boolean waiver value." },
        { status: 400 },
      );
    }

    if (waiver && reason.length === 0) {
      return NextResponse.json(
        { success: false, message: "A reason is required to grant a waiver." },
        { status: 400 },
      );
    }

    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          message: `The reason must be at most ${MAX_REASON_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    // The acting user always comes from the signed session cookie.
    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER"]);

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.user.userId;

    const result = await setDailyAttendanceWaiver({
      employeeId,
      date,
      waiver,
      reason,
      userId,
    });

    if (!result.ok) {
      if (result.reason === "on_leave") {
        return NextResponse.json(
          {
            success: false,
            message:
              "This date is covered by an approved leave, so a waiver cannot be granted.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "No employee with a shift exists for this employee and date.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result.state,
    });
  } catch (error) {
    console.error("Attendance waiver API failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update the attendance waiver.",
      },
      { status: 500 },
    );
  }
}
