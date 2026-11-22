import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/modules/auth/session-user";
import { createUser, listUsers } from "@/server/modules/users/user.service";
import type { UserRole } from "@/server/modules/users/user.types";

/**
 * Users Management API. Restricted to ADMIN users.
 */

/** `GET /api/v1/users` - list every system account. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN"]);
    if (!auth.ok) return auth.response;

    const users = await listUsers();

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error("User list API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to retrieve user accounts." },
      { status: 500 },
    );
  }
}

/**
 * `POST /api/v1/users` - create an account.
 * Body: `{ username, password, confirmPassword, role? }`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as
      | {
          username?: unknown;
          password?: unknown;
          confirmPassword?: unknown;
          role?: unknown;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Provide a JSON request body." },
        { status: 400 },
      );
    }

    if (
      typeof body.username !== "string" ||
      typeof body.password !== "string" ||
      typeof body.confirmPassword !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Provide a username, password, and confirm password." },
        { status: 400 },
      );
    }

    if (body.password !== body.confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match." },
        { status: 400 },
      );
    }

    const role = body.role !== undefined ? (body.role as UserRole) : "ADMIN";

    const result = await createUser({
      username: body.username,
      password: body.password,
      role,
    });

    if (!result.ok) {
      const status =
        result.error.code === "DUPLICATE_USERNAME"
          ? 409
          : result.error.code === "INVALID_ROLE"
            ? 400
            : 400;

      return NextResponse.json(
        { success: false, message: result.error.message },
        { status },
      );
    }

    return NextResponse.json({ success: true, data: result.user }, { status: 201 });
  } catch (error) {
    console.error("User create API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create the user account." },
      { status: 500 },
    );
  }
}
