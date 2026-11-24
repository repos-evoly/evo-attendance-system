import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * The proxy is the only gate protecting pages and session-only API routes,
 * so the session verifier and the database are mocked: assertions stay
 * focused on the active-user check, fail-closed behavior, and public paths.
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
import { proxy } from "./proxy";

const mockVerify = vi.mocked(verifySessionToken);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

const SESSION = {
  userId: "7",
  username: "alice",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
};

/** Minimal NextRequest stub exposing only what the proxy reads. */
function makeRequest(path: string, token?: string): NextRequest {
  const url = new URL(`http://localhost${path}`);
  const nextUrl = Object.assign(url, {
    clone: () => new URL(url.href),
  });

  return {
    nextUrl,
    cookies: {
      get: (name: string) =>
        name === "attendance_session" && token !== undefined
          ? { value: token }
          : undefined,
    },
  } as unknown as NextRequest;
}

/** `NextResponse.next()` marks itself with this internal header. */
function isNextResponse(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public paths", () => {
  it.each(["/login", "/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/health"])(
    "lets %s through without a session or database check",
    async (path) => {
      const response = await proxy(makeRequest(path));

      expect(isNextResponse(response)).toBe(true);
      expect(mockVerify).not.toHaveBeenCalled();
      expect(mockFindUnique).not.toHaveBeenCalled();
    }
  );
});

describe("protected pages", () => {
  it("redirects to /login when there is no session cookie", async () => {
    const response = await proxy(makeRequest("/daily-report"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("redirects to /login when the token is invalid", async () => {
    mockVerify.mockResolvedValue(null);

    const response = await proxy(makeRequest("/daily-report", "bad-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("lets an active user through", async () => {
    mockVerify.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ isActive: true } as never);

    const response = await proxy(makeRequest("/daily-report", "valid-token"));

    expect(isNextResponse(response)).toBe(true);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: BigInt(7) },
      select: { isActive: true },
    });
  });

  it("redirects a deactivated user to /login", async () => {
    mockVerify.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ isActive: false } as never);

    const response = await proxy(makeRequest("/daily-report", "valid-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects when the user no longer exists", async () => {
    mockVerify.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue(null as never);

    const response = await proxy(makeRequest("/", "valid-token"));

    expect(response.status).toBe(307);
  });
});

describe("protected APIs", () => {
  it("returns 401 JSON when there is no session", async () => {
    const response = await proxy(makeRequest("/api/v1/attendance/daily"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it("returns 401 for a deactivated user instead of serving data", async () => {
    mockVerify.mockResolvedValue(SESSION);
    mockFindUnique.mockResolvedValue({ isActive: false } as never);

    const response = await proxy(makeRequest("/api/v1/employees", "valid-token"));

    expect(response.status).toBe(401);
  });

  it("fails closed when the database check throws", async () => {
    mockVerify.mockResolvedValue(SESSION);
    mockFindUnique.mockRejectedValue(new Error("connection lost"));

    const response = await proxy(makeRequest("/api/v1/employees", "valid-token"));

    expect(response.status).toBe(401);
  });

  it("rejects a non-numeric session subject without querying the database", async () => {
    mockVerify.mockResolvedValue({ ...SESSION, userId: "not-a-number" });

    const response = await proxy(makeRequest("/api/v1/employees", "valid-token"));

    expect(response.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
