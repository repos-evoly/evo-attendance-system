/**
 * Session tokens shared by the Proxy (server-side request gate) and the auth
 * Route Handlers.
 *
 * The token is stateless: `base64url(payload).base64url(HMAC-SHA256(payload))`.
 * Nothing is stored server-side, so no new database table is required. The
 * signing key comes from `AUTH_SECRET` and is never logged or returned.
 *
 * Only Web Crypto (`crypto.subtle`) is used, so the module works in the
 * Node.js runtime and in the Edge runtime alike.
 */

export const SESSION_COOKIE_NAME = "attendance_session";

/** How long a session stays valid (1 hour). */
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

export interface Session {
  /** `users.user_id` as a string (the column is a bigint). */
  userId: string;
  username: string;
  /** Expiry as Unix seconds. */
  expiresAt: number;
  /** Issued-at as Unix seconds. Absent on tokens minted before it existed. */
  iat?: number;
}

/**
 * Development-only fallback so `next dev` runs without extra setup.
 * Production refuses to start without a real secret (see `getSessionSecret`).
 */
const DEV_FALLBACK_SECRET = "attendance-dev-only-insecure-secret";

function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();

  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set. Add a long random value to the environment before starting the server.",
    );
  }

  return DEV_FALLBACK_SECRET;
}

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

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sign(payload: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return new Uint8Array(signature);
}

/** Length-independent byte comparison, so verification does not leak timing. */
function signaturesMatch(expected: Uint8Array, provided: Uint8Array): boolean {
  if (expected.length !== provided.length) return false;

  let difference = 0;

  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index]! ^ provided[index]!;
  }

  return difference === 0;
}

/** Signs a session for the given user. The caller sets it as a cookie. */
export async function createSessionToken(input: {
  userId: string;
  username: string;
}): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const session: Session = {
    userId: input.userId,
    username: input.username,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS,
    iat: issuedAt,
  };
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(session)),
  );

  return `${payload}.${base64UrlEncode(await sign(payload))}`;
}

/** Returns the session only when the signature and expiry are both valid. */
export async function verifySessionToken(token: string): Promise<Session | null> {
  const separator = token.indexOf(".");

  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!signature) return null;

  let provided: Uint8Array;

  try {
    provided = base64UrlDecode(signature);
  } catch {
    return null;
  }

  if (!signaturesMatch(await sign(payload), provided)) return null;

  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    );

    if (typeof parsed !== "object" || parsed === null) return null;

    const { userId, username, expiresAt, iat } =
      parsed as Record<string, unknown>;

    if (
      typeof userId !== "string" ||
      typeof username !== "string" ||
      typeof expiresAt !== "number"
    ) {
      return null;
    }

    if (expiresAt * 1000 <= Date.now()) return null;

    // Tokens minted before `iat` existed carry the old 8-hour expiry, so the
    // issue time is inferred from it. Either way a session may not outlive
    // SESSION_MAX_AGE_SECONDS from issuance, which retires old 8-hour tokens.
    const LEGACY_SESSION_SECONDS = 8 * 60 * 60;
    const issuedAt =
      typeof iat === "number" ? iat : expiresAt - LEGACY_SESSION_SECONDS;

    if (
      issuedAt + SESSION_MAX_AGE_SECONDS <=
      Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return { userId, username, expiresAt, iat: typeof iat === "number" ? iat : undefined };
  } catch {
    return null;
  }
}

/** Cookie options shared by the login and logout handlers. */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    // `Secure` in production so the session cookie is never sent over HTTP.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
