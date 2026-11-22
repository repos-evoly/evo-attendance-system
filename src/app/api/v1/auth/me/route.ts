import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/server/modules/auth/session-user";
import { countActiveAdmins } from "@/server/modules/users/user.repository";

/**
 * `GET /api/v1/auth/me` - returns the current authenticated user's info.
 *
 * Returns userId, username, role, isActive, lastLoginAt, createdAt, and isOriginalAdmin.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const activeAdmins = await countActiveAdmins();

  return NextResponse.json({
    success: true,
    data: {
      userId: user.userId.toString(),
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      // For backward compatibility with tests/UI:
      isOriginalAdmin: user.role === "ADMIN",
      activeAdminCount: activeAdmins,
    },
  });
}
