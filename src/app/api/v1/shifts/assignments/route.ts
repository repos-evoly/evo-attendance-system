import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, requireRole } from "@/server/modules/auth/session-user";
import {
  createAssignment,
  listAssignments,
} from "@/server/modules/shifts/shift-assignment.service";

/**
 * `GET /api/v1/shifts/assignments?employeeId=<id>`
 * Lists shift assignments, optionally filtered by employeeId.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 },
      );
    }

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

    const assignments = await listAssignments(employeeId);

    return NextResponse.json({ success: true, data: assignments });
  } catch (error) {
    console.error("GET /api/v1/shifts/assignments failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve shift assignments." },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/v1/shifts/assignments`
 * Creates a new shift assignment for an employee.
 * Body: `{ employeeId: number, shiftId: number, startDate: string, endDate?: string | null }`
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN", "HR"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as
      | {
          employeeId?: unknown;
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

    const { employeeId, shiftId, startDate, endDate } = body;

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

    if (
      typeof shiftId !== "number" ||
      !Number.isInteger(shiftId) ||
      shiftId <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Provide a valid shiftId." },
        { status: 400 },
      );
    }

    if (typeof startDate !== "string") {
      return NextResponse.json(
        { success: false, message: "Provide a startDate string (YYYY-MM-DD)." },
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

    const result = await createAssignment({
      employeeId,
      shiftId,
      startDate,
      endDate: endDate ?? null,
    });

    if (!result.ok) {
      const status =
        result.error.code === "EMPLOYEE_NOT_FOUND" ||
        result.error.code === "SHIFT_NOT_FOUND"
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

    return NextResponse.json(
      { success: true, data: result.assignment },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/v1/shifts/assignments failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create shift assignment." },
      { status: 500 },
    );
  }
}
