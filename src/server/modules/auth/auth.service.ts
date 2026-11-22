import { prisma } from "@/server/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { updateLastLogin } from "../users/user.repository";

export interface AuthenticatedUser {
  /** `users.user_id` as a string (the column is a bigint). */
  userId: string;
  username: string;
  role: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  /** Signed session token; the caller stores it in an HttpOnly cookie. */
  token: string;
}

/**
 * Verifies a username/password pair against the `users` table.
 *
 * Returns `null` for an unknown username, wrong password, or inactive account,
 * so the response cannot be used to discover which usernames exist. Only the
 * stored hash is read; the plaintext password and the hash are never returned
 * or logged.
 *
 * On successful authentication, the lastLoginAt timestamp is updated.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<LoginResult | null> {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) return null;

  // Reject inactive accounts
  if (!user.isActive) return null;

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) return null;

  const userId = user.userId.toString();

  // Update last login timestamp on successful authentication
  await updateLastLogin(user.userId);

  return {
    user: { userId, username: user.username, role: user.role },
    token: await createSessionToken({ userId, username: user.username }),
  };
}
