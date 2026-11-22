/**
 * One waiver audit row as returned by `GET /api/v1/waivers`.
 *
 * `waiverId` / `waivedById` / `revokedById` are Postgres bigints and are
 * serialized to strings because JSON cannot represent `bigint`. `waiverDate`
 * is `YYYY-MM-DD`; the timestamps are ISO strings.
 *
 * Audit columns that were never filled (a still-active waiver has no revoker)
 * stay `null` rather than being replaced with a placeholder.
 */
export interface WaiverRecord {
  waiverId: string;
  employeeId: number;
  employeeName: string;
  /** `YYYY-MM-DD` - the waived attendance day. */
  waiverDate: string;
  reason: string;
  waivedById: string;
  waivedByName: string;
  /** ISO timestamp of the grant. */
  createdAt: string;
  /** `null` while the waiver is active. */
  revokedAt: string | null;
  revokedById: string | null;
  revokedByName: string | null;
  revocationReason: string | null;
}
