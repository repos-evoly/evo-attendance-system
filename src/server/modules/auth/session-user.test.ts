import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The authorization helper is the only gate every protected Route Handler
 * relies on, so the database and the session verifier are mocked: no real
 * connection is required and the assertions stay focused on the four roles,
 * inactive-account rejection, and live role resolution.
 */
vi.mock("@/server/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE_NAME: "attendance_session",
  verifySessionToken: vi.fn(),
}));

import { verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/server/prisma";
import type { UserRole } from "@/server/modules/users/user.types";
import { getAuthenticatedUser, requireRole } from "./session-user";

const mockVerify = vi.mocked(verifySessionToken);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

const USER_ID = BigInt(7);

/** Minimal NextRequest stub exposing only what the helper reads. */
function makeRequest(token?: string): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name === "attendance_session" && token !== undefined
          ? { value: token }
          : undefined,
    },
  } as unknown as NextRequest;
}

function dbUser(role: UserRole, isActive = true) {
  return {
    userId: USER_ID,
    username: "alice",
    role,
    isActive,
  };
}

/** A valid session whose subject is the default user. */
function signedIn(token = "valid-token") {
  mockVerify.mockResolvedValue({
    userId: USER_ID.toString(),
    username: "alice",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
  return makeRequest(token);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuthenticatedUser", () => {
  it("returns null when the session cookie is missing", async () => {
    const user = await getAuthenticatedUser(makeRequest());

    expect(user).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("returns null when the token is invalid", async () => {
    mockVerify.mockResolvedValue(null);

    const user = await getAuthenticatedUser(makeRequest("bad-token"));

    expect(user).toBeNull();
  });

  it("returns null when the token subject is not a numeric id", async () => {
    mockVerify.mockResolvedValue({
      userId: "not-a-number",
      username: "alice",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const user = await getAuthenticatedUser(makeRequest("token"));

    expect(user).toBeNull();
  });

  it("returns null when the account no longer exists", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    const user = await getAuthenticatedUser(signedIn());

    expect(user).toBeNull();
  });

  it("rejects an inactive account so it cannot reach protected APIs", async () => {
    mockFindUnique.mockResolvedValue(dbUser("ADMIN", false) as never);

    const user = await getAuthenticatedUser(signedIn());

    expect(user).toBeNull();
  });

  it("resolves the role stored in the database for each of the four roles", async () => {
    for (const role of ["ADMIN", "HR", "MANAGER", "VIEWER"] as const) {
      mockFindUnique.mockResolvedValue(dbUser(role) as never);

      const user = await getAuthenticatedUser(signedIn());

      expect(user?.role).toBe(role);
    }
  });

  it("applies a role change on the next request (no stale session role)", async () => {
    mockFindUnique.mockResolvedValue(dbUser("ADMIN") as never);
    const first = await getAuthenticatedUser(signedIn());

    // The same signed token is reused; only the database row changes.
    mockFindUnique.mockResolvedValue(dbUser("VIEWER") as never);
    const second = await getAuthenticatedUser(signedIn());

    expect(first?.role).toBe("ADMIN");
    expect(second?.role).toBe("VIEWER");
  });
});

describe("requireRole", () => {
  it("returns 401 when there is no session", async () => {
    const result = await requireRole(makeRequest(), ["ADMIN"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns 401 when the account is inactive", async () => {
    mockFindUnique.mockResolvedValue(dbUser("ADMIN", false) as never);

    const result = await requireRole(signedIn(), ["ADMIN"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("allows every role that is explicitly listed", async () => {
    const roles = ["ADMIN", "HR", "MANAGER", "VIEWER"] as const;

    for (const role of roles) {
      mockFindUnique.mockResolvedValue(dbUser(role) as never);

      const result = await requireRole(signedIn(), roles);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user.role).toBe(role);
      }
    }
  });

  it("returns 403 when the role is not allowed", async () => {
    mockFindUnique.mockResolvedValue(dbUser("VIEWER") as never);

    const result = await requireRole(signedIn(), ["ADMIN", "HR"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("separates ADMIN-only routes from the other roles", async () => {
    mockFindUnique.mockResolvedValue(dbUser("HR") as never);
    const denied = await requireRole(signedIn(), ["ADMIN"]);
    expect(denied.ok).toBe(false);

    mockFindUnique.mockResolvedValue(dbUser("ADMIN") as never);
    const allowed = await requireRole(signedIn(), ["ADMIN"]);
    expect(allowed.ok).toBe(true);
  });
});
