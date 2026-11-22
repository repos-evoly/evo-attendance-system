import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { updateUser } from "@/server/modules/users/user.service";
import type { UserRole } from "@/server/modules/users/user.types";

/**
 * `PATCH /api/v1/users/[userId]` - update a user's password, status, or role.
 * Body: `{ newPassword?: string, confirmPassword?: string, isActive?: boolean, role?: UserRole }`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireRole(request, ["ADMIN"]);
    if (!auth.ok) return auth.response;

    const { userId } = await params;

    if (!/^\d+$/.test(userId)) {
      return NextResponse.json(
        { success: false, message: "Provide a valid userId." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          newPassword?: unknown;
          confirmPassword?: unknown;
          isActive?: unknown;
          role?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    const { newPassword, confirmPassword, isActive, role } = body;

    if (
      newPassword === undefined &&
      isActive === undefined &&
      role === undefined
    ) {
      return NextResponse.json(
        { success: false, message: "Provide newPassword, isActive, or role." },
        { status: 400 },
      );
    }

    let parsedNewPassword: string | undefined;
    if (newPassword !== undefined) {
      if (typeof newPassword !== "string") {
        return NextResponse.json(
          { success: false, message: "newPassword must be a string." },
          { status: 400 },
        );
      }

      if (typeof confirmPassword !== "string") {
        return NextResponse.json(
          { success: false, message: "confirmPassword must be a string." },
          { status: 400 },
        );
      }

      if (newPassword !== confirmPassword) {
        return NextResponse.json(
          { success: false, message: "Passwords do not match." },
          { status: 400 },
        );
      }

      parsedNewPassword = newPassword;
    }

    let parsedIsActive: boolean | undefined;
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json(
          { success: false, message: "isActive must be a boolean." },
          { status: 400 },
        );
      }
      parsedIsActive = isActive;
    }

    let parsedRole: UserRole | undefined;
    if (role !== undefined) {
      if (typeof role !== "string") {
        return NextResponse.json(
          { success: false, message: "role must be a string." },
          { status: 400 },
        );
      }
      parsedRole = role as UserRole;
    }

    const result = await updateUser({
      userId: BigInt(userId),
      newPassword: parsedNewPassword,
      isActive: parsedIsActive,
      role: parsedRole,
      actingUserId: auth.user.userId,
    });

    if (!result.ok) {
      const status =
        result.error.code === "NOT_FOUND"
          ? 404
          : result.error.code === "CANNOT_DEACTIVATE_SELF" ||
              result.error.code === "CANNOT_DEMOTE_SELF" ||
              result.error.code === "CANNOT_REMOVE_LAST_ADMIN"
            ? 403
            : 400;

      return NextResponse.json(
        { success: false, message: result.error.message },
        { status },
      );
    }

    return NextResponse.json({ success: true, data: result.user });
  } catch (error) {
    console.error("User update API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update the user account." },
      { status: 500 },
    );
  }
}
