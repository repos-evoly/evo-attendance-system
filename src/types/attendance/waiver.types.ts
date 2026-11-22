/**
 * Types mirroring the `GET /api/v1/waivers` endpoint.
 *
 * The endpoint returns the same envelope as every other route:
 *   success -> { success: true, data }
 *   failure -> { success: false, message }
 *
 * `waiverId` / `waivedById` / `revokedById` are Postgres bigints and arrive as
 * strings because JSON cannot represent `bigint`. `waiverDate` is `YYYY-MM-DD`
 * and the timestamps are ISO strings. These are display contracts only.
 */

/** Derived status: a waiver is ACTIVE until it is revoked. */
export type WaiverStatusValue = "ACTIVE" | "REVOKED";

/** One waiver record as returned by `GET /api/v1/waivers`. */
export interface WaiverRecord {
  waiverId: string;
  employeeId: number;
  employeeName: string;
  waiverDate: string;
  reason: string;
  waivedById: string;
  waivedByName: string;
  createdAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revokedByName: string | null;
  revocationReason: string | null;
}

export const WAIVER_STATUS_LABELS: Record<WaiverStatusValue, string> = {
  ACTIVE: "Active",
  REVOKED: "Revoked",
};

/** A waiver is ACTIVE until `revokedAt` is stamped on it. */
export function getWaiverStatus(waiver: WaiverRecord): WaiverStatusValue {
  return waiver.revokedAt === null ? "ACTIVE" : "REVOKED";
}
