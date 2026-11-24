import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { cancelLeave } from "@/server/modules/leave/leave.service";

/** Longest accepted cancellation reason. */
const MAX_REASON_LENGTH = 500;

type RouteContext = {
  params: Promise<{ leaveId: string }>;
};

/**
 * `PATCH /api/v1/leave/[leaveId]` - cancel one leave record.
 *
 * Cancelling preserves the original record and stores who cancelled it, when
 * and why; the leave is never deleted. This replaces the previous permanent
 * DELETE so no destructive action is reachable from the UI.
 *
 * Body: `{ reason: string }` (required). The acting user always comes from the
 * verified session.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { leaveId } = await params;

    if (!/^\d+$/.test(leaveId)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid leaveId." },
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
        { success: false, message: "A reason is required to cancel a leave." },
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

    const auth = await requireRole(request, ["ADMIN", "HR", "MANAGER"]);

    if (!auth.ok) {
      return auth.response;
    }

    const userId = auth.user.userId;

    const result = await cancelLeave(BigInt(leaveId), {
      reason,
      cancelledById: userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.error.message },
        { status: result.error.code === "NOT_FOUND" ? 404 : 409 },
      );
    }

    if (result.attendanceRefresh.failedDates.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Leave was cancelled, but attendance refresh failed for ${result.attendanceRefresh.failedDates.length} date(s): ${result.attendanceRefresh.failedDates.join(", ")}.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: result.leave });
  } catch (error) {
    console.error("Leave cancellation API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to cancel the leave record." },
      { status: 500 },
    );
  }
}
