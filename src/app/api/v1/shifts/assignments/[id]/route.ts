import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { updateAssignment } from "@/server/modules/shifts/shift-assignment.service";

/**
 * `PATCH /api/v1/shifts/assignments/[id]`
 * Updates an existing shift assignment.
 * Body: `{ shiftId?: number, startDate?: string, endDate?: string | null }`
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid assignment ID." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          shiftId?: unknown;
          startDate?: unknown;
          endDate?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    const { shiftId, startDate, endDate } = body;

    if (
      shiftId === undefined &&
      startDate === undefined &&
      endDate === undefined
    ) {
      return NextResponse.json(
        { success: false, message: "Provide at least one field to update (shiftId, startDate, or endDate)." },
        { status: 400 },
      );
    }

    if (
      shiftId !== undefined &&
      (typeof shiftId !== "number" || !Number.isInteger(shiftId) || shiftId <= 0)
    ) {
      return NextResponse.json(
        { success: false, message: "Provide a valid shiftId." },
        { status: 400 },
      );
    }

    if (startDate !== undefined && typeof startDate !== "string") {
      return NextResponse.json(
        { success: false, message: "startDate must be a string (YYYY-MM-DD)." },
        { status: 400 },
      );
    }

    if (
      endDate !== undefined &&
      endDate !== null &&
      typeof endDate !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "endDate must be a string (YYYY-MM-DD) or null." },
        { status: 400 },
      );
    }

    const result = await updateAssignment(BigInt(id), {
      shiftId,
      startDate,
      endDate,
    });

    if (!result.ok) {
      const status =
        result.error.code === "ASSIGNMENT_NOT_FOUND" ||
        result.error.code === "SHIFT_NOT_FOUND" ||
        result.error.code === "EMPLOYEE_NOT_FOUND"
          ? 404
          : result.error.code === "OVERLAPPING_ASSIGNMENT"
            ? 409
            : result.error.code === "DATABASE_ERROR"
              ? 500
              : 400;

      return NextResponse.json(
        { success: false, message: result.error.message, code: result.error.code },
        { status },
      );
    }

    return NextResponse.json({ success: true, data: result.assignment });
  } catch (error) {
    console.error("PATCH /api/v1/shifts/assignments/[id] failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update shift assignment." },
      { status: 500 },
    );
  }
}

/** `PUT /api/v1/shifts/assignments/[id]` - alias to PATCH for compatibility. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}
