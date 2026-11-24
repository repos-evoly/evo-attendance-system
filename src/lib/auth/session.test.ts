import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from "./session";

/**
 * Session tokens are stateless HMAC-SHA256 values, so these tests exercise the
 * real sign/verify path. `NODE_ENV` is "test" here, which selects the
 * development fallback secret - no AUTH_SECRET setup is required.
 */

const DEV_SECRET = "attendance-dev-only-insecure-secret";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeText(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

/** Signs an arbitrary payload exactly like `sign()` in session.ts. */
async function signPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(DEV_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/** Builds a legacy-format token (no `iat`, 8-hour expiry) for a payload. */
async function legacyToken(payload: Record<string, unknown>): Promise<string> {
  const encoded = base64UrlEncodeText(JSON.stringify(payload));

  return `${encoded}.${await signPayload(encoded)}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a session with a one-hour expiry and issued-at", async () => {
    const token = await createSessionToken({ userId: "7", username: "alice" });
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("7");
    expect(session?.username).toBe("alice");
    expect(session?.iat).toBeTypeOf("number");
    expect(session!.expiresAt - session!.iat!).toBe(SESSION_MAX_AGE_SECONDS);
    expect(SESSION_MAX_AGE_SECONDS).toBe(3600);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken({ userId: "7", username: "alice" });
    const [payload] = token.split(".");
    const forged = `${payload}.${btoa("forged-signature")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}`;

    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("no-separator")).toBeNull();
    expect(await verifySessionToken(".onlysig")).toBeNull();
  });

  it("rejects a session once its expiry has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T10:00:00.000Z"));

    const token = await createSessionToken({ userId: "7", username: "alice" });

    // One second past the one-hour expiry.
    vi.setSystemTime(new Date("2026-11-24T11:00:01.000Z"));

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a legacy 8-hour token more than one hour after issuance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T10:00:00.000Z"));

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Legacy format: no `iat`, expiry 8 hours out (the old SESSION_MAX_AGE).
    const token = await legacyToken({
      userId: "7",
      username: "alice",
      expiresAt: nowSeconds + 8 * 60 * 60,
    });

    // Still valid shortly after issuance.
    expect(await verifySessionToken(token)).not.toBeNull();

    // Two hours later the expiresAt is still ~6h in the future, but the
    // inferred issue time is older than the one-hour maximum.
    vi.setSystemTime(new Date("2026-11-24T12:00:00.000Z"));

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("keeps a freshly issued legacy token valid for at most one hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T10:00:00.000Z"));

    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await legacyToken({
      userId: "7",
      username: "alice",
      expiresAt: nowSeconds + 8 * 60 * 60,
    });

    // 59 minutes after issuance: still inside the one-hour window.
    vi.setSystemTime(new Date("2026-11-24T10:59:00.000Z"));
    expect(await verifySessionToken(token)).not.toBeNull();

    // 61 minutes after issuance: beyond the one-hour maximum.
    vi.setSystemTime(new Date("2026-11-24T11:01:00.000Z"));
    expect(await verifySessionToken(token)).toBeNull();
  });
});
