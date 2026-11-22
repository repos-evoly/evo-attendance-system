import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

/** Clears the session cookie. Always succeeds, even without a session. */
export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { signedOut: true },
  });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
