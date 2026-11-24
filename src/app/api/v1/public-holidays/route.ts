import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { createHoliday, listHolidays } from "@/server/modules/public-holiday/public-holiday.service";

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

/** `GET /api/v1/public-holidays` - list public holiday records. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER", "VIEWER"]);
    if (!auth.ok) return auth.response;

    const holidays = await listHolidays();

    return NextResponse.json({ success: true, data: holidays });
  } catch (error) {
    console.error("Public holiday list API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to retrieve public holiday records." },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/v1/public-holidays` - create a public holiday record.
 *
 * Body: `{ name, dateFrom, dateTo, reason? }`.
 * `createdById` always comes from the verified session.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR"]);

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.user.userId;

    const body = (await request.json().catch(() => null)) as
      | {
          name?: unknown;
          dateFrom?: unknown;
          dateTo?: unknown;
          reason?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    const { name, dateFrom, dateTo, reason } = body;

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Provide a non-empty holiday name." },
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

    const result = await createHoliday({
      name,
      dateFrom,
      dateTo,
      reason: trimmedReason,
      createdById: userId,
    });

    if (!result.ok) {
      const status =
        result.error.code === "OVERLAP"
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
          message: `Public holiday was created, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.holiday });
  } catch (error) {
    console.error("Public holiday create API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create the public holiday record." },
      { status: 500 },
    );
  }
}
