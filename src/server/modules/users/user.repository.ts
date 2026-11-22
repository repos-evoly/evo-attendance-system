import { prisma } from "@/server/prisma";
import type { UserAccount, UserRole } from "./user.types";

/**
 * Only the non-secret columns are ever read. `password_hash` is intentionally
 * excluded so a hash can never leave the server through this repository.
 */
const USER_SELECT = {
  userId: true,
  username: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

interface UserRow {
  userId: bigint;
  username: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

function toAccount(row: UserRow): UserAccount {
  return {
    userId: row.userId.toString(),
    username: row.username,
    role: (row.role as UserRole) || "ADMIN",
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Every system account, oldest first. Hashes are never selected. */
export async function listUserAccounts(): Promise<UserAccount[]> {
  const rows = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { userId: "asc" },
  });

  return rows.map(toAccount);
}

/** Counts how many active ADMIN accounts currently exist. */
export async function countActiveAdmins(): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
    },
  });
}

/** Gets a single user account by userId. */
export async function getUserAccountById(
  userId: bigint,
): Promise<UserAccount | null> {
  const row = await prisma.user.findUnique({
    where: { userId },
    select: USER_SELECT,
  });

  return row ? toAccount(row) : null;
}

/** The id of the account holding `username`, or null when it is free. */
export async function findUserByUsername(
  username: string,
): Promise<{ userId: bigint } | null> {
  return prisma.user.findUnique({
    where: { username },
    select: { userId: true },
  });
}

/** Inserts one account. The caller supplies an already-hashed password. */
export async function createUserAccount(input: {
  username: string;
  passwordHash: string;
  role?: UserRole;
}): Promise<UserAccount> {
  const created = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? "ADMIN",
    },
    select: USER_SELECT,
  });

  return toAccount(created);
}

/** Updates user fields (password, status, and/or role). */
export async function updateUserAccount(
  userId: bigint,
  data: {
    passwordHash?: string;
    isActive?: boolean;
    role?: UserRole;
  },
): Promise<UserAccount | null> {
  const updated = await prisma.user.update({
    where: { userId },
    data: {
      ...(data.passwordHash !== undefined ? { passwordHash: data.passwordHash } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
    },
    select: USER_SELECT,
  });

  return toAccount(updated);
}

/** Updates a user's password. Kept for convenience. */
export async function updateUserPassword(
  userId: bigint,
  passwordHash: string,
): Promise<UserAccount | null> {
  return updateUserAccount(userId, { passwordHash });
}

/** Updates a user's active status. Kept for convenience. */
export async function updateUserStatus(
  userId: bigint,
  isActive: boolean,
): Promise<UserAccount | null> {
  return updateUserAccount(userId, { isActive });
}

/** Updates the last login timestamp after a successful login. */
export async function updateLastLogin(userId: bigint): Promise<void> {
  await prisma.user.update({
    where: { userId },
    data: { lastLoginAt: new Date() },
  });
}
