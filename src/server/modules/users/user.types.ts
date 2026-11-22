export type UserRole = "ADMIN" | "HR" | "MANAGER" | "VIEWER";

export const USER_ROLES: readonly UserRole[] = ["ADMIN", "HR", "MANAGER", "VIEWER"] as const;

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && (USER_ROLES as readonly string[]).includes(role);
}

/**
 * One system account as returned by `GET /api/v1/users`.
 *
 * `userId` is a Postgres bigint and is serialized to a string because JSON
 * cannot represent `bigint`. `createdAt` and `lastLoginAt` are ISO strings.
 *
 * `passwordHash` is deliberately absent: hashes are never selected, returned
 * or logged by the Users API.
 */
export interface UserAccount {
  userId: string;
  username: string;
  role: UserRole;
  /** Whether the account can log in. Inactive accounts are rejected at login. */
  isActive: boolean;
  /** ISO timestamp of the most recent successful login, or null if never logged in. */
  lastLoginAt: string | null;
  /** ISO timestamp of when the account was created. */
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  userId: bigint;
  newPassword?: string;
  isActive?: boolean;
  role?: UserRole;
  actingUserId: bigint;
}
