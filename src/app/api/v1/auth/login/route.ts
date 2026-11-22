import { NextResponse } from "next/server";
import { authenticate } from "@/server/modules/auth/auth.service";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/auth/session";

/** Guards against oversized payloads before any hashing work happens. */
const MAX_FIELD_LENGTH = 200;

/** Same message for a bad payload, unknown username and wrong password. */
const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password.";

function readField(body: unknown, key: string): string {
  if (typeof body !== "object" || body === null) return "";

  const value = (body as Record<string, unknown>)[key];

  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const username = readField(body, "username").trim();
  const password = readField(body, "password");

  if (
    !username ||
    !password ||
    username.length > MAX_FIELD_LENGTH ||
    password.length > MAX_FIELD_LENGTH
  ) {
    return NextResponse.json(
      { success: false, message: INVALID_CREDENTIALS_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const result = await authenticate(username, password);

    if (!result) {
      return NextResponse.json(
        { success: false, message: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      success: true,
      data: { user: result.user, expiresIn: SESSION_MAX_AGE_SECONDS },
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.token,
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    // The error is logged without the request body, so credentials never leak.
    console.error("Login failed:", error);

    return NextResponse.json(
      { success: false, message: "Could not sign in. Please try again." },
      { status: 500 },
    );
  }
}
