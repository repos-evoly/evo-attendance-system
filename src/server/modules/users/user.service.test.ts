import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The service owns the account business rules, so the repository and the
 * password hasher are mocked: no database connection is required and the
 * assertions stay focused on role updates and the last-active-ADMIN guard.
 */
vi.mock("./user.repository", () => ({
  countActiveAdmins: vi.fn(),
  createUserAccount: vi.fn(),
  findUserByUsername: vi.fn(),
  getUserAccountById: vi.fn(),
  listUserAccounts: vi.fn(),
  updateUserAccount: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(async () => "hashed-password"),
}));

import {
  countActiveAdmins,
  getUserAccountById,
  updateUserAccount,
} from "./user.repository";
import { updateUser } from "./user.service";
import type { UserAccount, UserRole } from "./user.types";

const mockGetUser = vi.mocked(getUserAccountById);
const mockCountAdmins = vi.mocked(countActiveAdmins);
const mockUpdate = vi.mocked(updateUserAccount);

const ACTING_ADMIN = BigInt(1);
const TARGET_ID = BigInt(2);

function account(role: UserRole, isActive = true, userId = TARGET_ID): UserAccount {
  return {
    userId: userId.toString(),
    username: "bob",
    role,
    isActive,
    lastLoginAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateUser last-active-ADMIN protection", () => {
  it("refuses to deactivate the only active administrator", async () => {
    mockGetUser.mockResolvedValue(account("ADMIN"));
    mockCountAdmins.mockResolvedValue(1);

    const result = await updateUser({
      userId: TARGET_ID,
      isActive: false,
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANNOT_REMOVE_LAST_ADMIN");
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses to demote the only active administrator", async () => {
    mockGetUser.mockResolvedValue(account("ADMIN"));
    mockCountAdmins.mockResolvedValue(1);

    const result = await updateUser({
      userId: TARGET_ID,
      role: "HR",
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANNOT_REMOVE_LAST_ADMIN");
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows demoting an administrator when another active one remains", async () => {
    mockGetUser.mockResolvedValue(account("ADMIN"));
    mockCountAdmins.mockResolvedValue(2);
    mockUpdate.mockResolvedValue(account("HR"));

    const result = await updateUser({
      userId: TARGET_ID,
      role: "HR",
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.role).toBe("HR");
    }
  });
});

describe("updateUser self-protection", () => {
  it("refuses to let an administrator deactivate their own account", async () => {
    mockGetUser.mockResolvedValue(account("ADMIN", true, ACTING_ADMIN));
    mockCountAdmins.mockResolvedValue(2);

    const result = await updateUser({
      userId: ACTING_ADMIN,
      isActive: false,
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANNOT_DEACTIVATE_SELF");
    }
  });

  it("refuses to let an administrator demote their own account", async () => {
    mockGetUser.mockResolvedValue(account("ADMIN", true, ACTING_ADMIN));

    const result = await updateUser({
      userId: ACTING_ADMIN,
      role: "VIEWER",
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CANNOT_DEMOTE_SELF");
    }
  });
});

describe("updateUser role validation", () => {
  it("rejects an unknown role", async () => {
    mockGetUser.mockResolvedValue(account("VIEWER"));

    const result = await updateUser({
      userId: TARGET_ID,
      role: "SUPERUSER" as UserRole,
      actingUserId: ACTING_ADMIN,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ROLE");
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
