import { NextResponse } from "next/server";
import { listWaivers } from "@/server/modules/waiver/waiver.service";

/**
 * `GET /api/v1/waivers` - list waiver audit records (active and revoked).
 *
 * Read-only. The session gate in `src/proxy.ts` protects this endpoint, so no
 * extra auth check is needed here. Granting and revoking a waiver still go
 * through the existing `PATCH /api/v1/attendance/waiver` endpoint.
 */
export async function GET() {
  try {
    const waivers = await listWaivers();

    return NextResponse.json({ success: true, data: waivers });
  } catch (error) {
    console.error("Waiver list API failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to retrieve waiver records." },
      { status: 500 },
    );
  }
}
