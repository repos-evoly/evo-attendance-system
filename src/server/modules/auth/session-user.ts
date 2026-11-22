import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/server/prisma";
import type { UserRole } from "@/server/modules/users/user.types";

export interface AuthenticatedSessionUser {
  userId: bigint;
  username: string;
  role: UserRole;
  isActive: boolean;
}

export type RequireRoleResult =
  | { ok: true; user: AuthenticatedSessionUser }
  | { ok: false; response: NextResponse };

/**
 * Resolves the authenticated user from the signed session token and checks
 * the database on every request to ensure the account is active and retrieve
 * its current live role.
 *
 * Returns null if the session is missing, invalid, or the account is inactive.
 */
export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedSessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const session = await verifySessionToken(token);

  if (!session || !/^\d+$/.test(session.userId)) return null;

  const userId = BigInt(session.userId);

  const user = await prisma.user.findUnique({
    where: { userId },
    select: {
      userId: true,
      username: true,
      role: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  const role = (user.role as UserRole) || "ADMIN";

  return {
    userId: user.userId,
    username: user.username,
    role,
    isActive: user.isActive,
  };
}

/**
 * Resolves the acting user's id (`users.user_id` as a bigint) from the signed
 * session cookie. Checks that the user exists and is active.
 *
 * Maintained for backward compatibility.
 */
export async function getAuthenticatedUserId(
  request: NextRequest,
): Promise<bigint | null> {
  const user = await getAuthenticatedUser(request);
  return user ? user.userId : null;
}

/**
 * Verifies that the request comes from an authenticated, active user with one
 * of the allowed roles. If not, returns an appropriate NextResponse (401 or 403).
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: readonly UserRole[],
): Promise<RequireRoleResult> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Forbidden: insufficient permissions." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}
