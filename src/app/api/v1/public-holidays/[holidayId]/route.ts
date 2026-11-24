import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { cancelHoliday, reactivateHoliday, updateHoliday } from "@/server/modules/public-holiday/public-holiday.service";

/** Longest accepted cancellation reason. */
const MAX_REASON_LENGTH = 500;

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

/**
 * `PATCH /api/v1/public-holidays/[holidayId]` - update a public holiday record.
 *
 * Body: `{ name, dateFrom, dateTo, reason? }`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ holidayId: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR"]);

    if (!auth.ok) {
      return auth.response;
    }

    const { holidayId } = await params;

    if (!/^\d+$/.test(holidayId)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid holidayId." },
        { status: 400 },
      );
    }

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

    const result = await updateHoliday(BigInt(holidayId), {
      name,
      dateFrom,
      dateTo,
      reason: trimmedReason,
    });

    if (!result.ok) {
      const status =
        result.error.code === "NOT_FOUND"
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
          message: `Public holiday was updated, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.holiday });
  } catch (error) {
    console.error("Public holiday update API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update the public holiday record." },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/v1/public-holidays/[holidayId]` - reactivate a cancelled public holiday record.
 *
 * Reactivating clears the cancellation fields to restore the holiday as ACTIVE.
 * The original cancellation audit information is preserved in the record's history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ holidayId: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR"]);

    if (!auth.ok) {
      return auth.response;
    }

    const { holidayId } = await params;

    if (!/^\d+$/.test(holidayId)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid holidayId." },
        { status: 400 },
      );
    }

    const result = await reactivateHoliday(BigInt(holidayId), {
      reactivatedById: auth.user.userId,
    });

    if (!result.ok) {
      const status =
        result.error.code === "NOT_FOUND"
          ? 404
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
          message: `Public holiday was reactivated, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.holiday });
  } catch (error) {
    console.error("Public holiday reactivate API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to reactivate the public holiday record." },
      { status: 500 },
    );
  }
}

/**
 * `DELETE /api/v1/public-holidays/[holidayId]` - cancel a public holiday record.
 *
 * Cancelling preserves the original record and stores who cancelled it, when
 * and why; the holiday is never deleted. This replaces the previous permanent
 * DELETE so no destructive action is reachable from the UI.
 *
 * Body: `{ reason: string }` (required). The acting user always comes from the
 * verified session.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ holidayId: string }> },
) {
  try {
    const { holidayId } = await params;

    if (!/^\d+$/.test(holidayId)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid holidayId." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { reason?: unknown }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "A reason is required to cancel a public holiday." },
        { status: 400 },
      );
    }

    const reason = body.reason.trim();

    if (reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          message: `The reason must be at most ${MAX_REASON_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const auth = await requireRole(request, ["ADMIN", "HR"]);

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.user.userId;

    const result = await cancelHoliday(BigInt(holidayId), {
      reason,
      cancelledById: userId,
    });

    if (!result.ok) {
      const status =
        result.error.code === "NOT_FOUND"
          ? 404
          : result.error.code === "ALREADY_CANCELLED"
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
          message: `Public holiday was cancelled, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.holiday });
  } catch (error) {
    console.error("Public holiday cancellation API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to cancel the public holiday record." },
      { status: 500 },
    );
  }
}
