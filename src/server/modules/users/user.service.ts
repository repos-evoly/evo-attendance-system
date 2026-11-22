import { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import {
  countActiveAdmins,
  createUserAccount,
  findUserByUsername,
  getUserAccountById,
  listUserAccounts,
  updateUserAccount,
} from "./user.repository";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserAccount,
  UserRole,
} from "./user.types";
import { isValidRole } from "./user.types";

/** Bounds mirroring the `users` columns and the login route's limits. */
const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 200;

export type CreateUserErrorCode =
  | "INVALID_USERNAME"
  | "INVALID_PASSWORD"
  | "INVALID_ROLE"
  | "DUPLICATE_USERNAME";

export interface CreateUserError {
  code: CreateUserErrorCode;
  message: string;
}

export type CreateUserResult =
  | { ok: true; user: UserAccount }
  | { ok: false; error: CreateUserError };

export type UpdateUserErrorCode =
  | "INVALID_PASSWORD"
  | "INVALID_ROLE"
  | "NOT_FOUND"
  | "CANNOT_DEACTIVATE_SELF"
  | "CANNOT_DEMOTE_SELF"
  | "CANNOT_REMOVE_LAST_ADMIN"
  | "NO_CHANGES";

export interface UpdateUserError {
  code: UpdateUserErrorCode;
  message: string;
}

export type UpdateUserResult =
  | { ok: true; user: UserAccount }
  | { ok: false; error: UpdateUserError };

/** Lists every system account. Read-only. */
export async function listUsers(): Promise<UserAccount[]> {
  return listUserAccounts();
}

/**
 * Creates one account from a username, password, and role.
 */
export async function createUser(
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const username = input.username.trim();

  if (username.length === 0 || username.length > MAX_USERNAME_LENGTH) {
    return {
      ok: false,
      error: {
        code: "INVALID_USERNAME",
        message: `Provide a username of at most ${MAX_USERNAME_LENGTH} characters.`,
      },
    };
  }

  if (input.password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: {
        code: "INVALID_PASSWORD",
        message: `Provide a password of at most ${MAX_PASSWORD_LENGTH} characters.`,
      },
    };
  }

  const role: UserRole = input.role ?? "ADMIN";
  if (!isValidRole(role)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROLE",
        message: "Provide a valid user role (ADMIN, HR, MANAGER, VIEWER).",
      },
    };
  }

  if (await findUserByUsername(username)) {
    return {
      ok: false,
      error: {
        code: "DUPLICATE_USERNAME",
        message: "That username is already taken.",
      },
    };
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return {
      ok: true,
      user: await createUserAccount({ username, passwordHash, role }),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: {
          code: "DUPLICATE_USERNAME",
          message: "That username is already taken.",
        },
      };
    }

    throw error;
  }
}

/**
 * Updates a user account: password, status, and/or role.
 *
 * Rules:
 * - Demoting or deactivating the last active ADMIN is forbidden.
 * - An administrator cannot deactivate their own account.
 * - An administrator cannot demote their own account from ADMIN.
 */
export async function updateUser(
  input: UpdateUserInput,
): Promise<UpdateUserResult> {
  const targetUser = await getUserAccountById(input.userId);

  if (!targetUser) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    };
  }

  const isSelf = input.userId === input.actingUserId;
  const isTargetActiveAdmin = targetUser.role === "ADMIN" && targetUser.isActive;

  // 1. Validate password if provided
  let passwordHash: string | undefined;
  if (input.newPassword !== undefined) {
    if (input.newPassword.length > MAX_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: {
          code: "INVALID_PASSWORD",
          message: `Provide a password of at most ${MAX_PASSWORD_LENGTH} characters.`,
        },
      };
    }
    passwordHash = await hashPassword(input.newPassword);
  }

  // 2. Validate role if provided
  if (input.role !== undefined && !isValidRole(input.role)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROLE",
        message: "Provide a valid user role (ADMIN, HR, MANAGER, VIEWER).",
      },
    };
  }

  // 3. Self-protection checks
  if (isSelf) {
    if (input.isActive === false) {
      return {
        ok: false,
        error: {
          code: "CANNOT_DEACTIVATE_SELF",
          message: "You cannot deactivate your own account.",
        },
      };
    }

    if (input.role !== undefined && input.role !== "ADMIN" && targetUser.role === "ADMIN") {
      return {
        ok: false,
        error: {
          code: "CANNOT_DEMOTE_SELF",
          message: "You cannot remove your own administrator role.",
        },
      };
    }
  }

  // 4. Last active Admin protection check
  const wouldDeactivateAdmin =
    isTargetActiveAdmin && input.isActive === false;
  const wouldDemoteAdmin =
    isTargetActiveAdmin &&
    input.role !== undefined &&
    input.role !== "ADMIN" &&
    (input.isActive === undefined || input.isActive === true);

  if (wouldDeactivateAdmin || wouldDemoteAdmin) {
    const activeAdminCount = await countActiveAdmins();
    if (activeAdminCount <= 1) {
      return {
        ok: false,
        error: {
          code: "CANNOT_REMOVE_LAST_ADMIN",
          message: "Cannot deactivate or demote the only active administrator.",
        },
      };
    }
  }

  if (
    passwordHash === undefined &&
    input.isActive === undefined &&
    input.role === undefined
  ) {
    return {
      ok: false,
      error: {
        code: "NO_CHANGES",
        message: "No changes provided.",
      },
    };
  }

  const updated = await updateUserAccount(input.userId, {
    passwordHash,
    isActive: input.isActive,
    role: input.role,
  });

  if (!updated) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    };
  }

  return { ok: true, user: updated };
}
