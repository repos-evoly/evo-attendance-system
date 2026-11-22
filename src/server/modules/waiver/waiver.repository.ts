import { prisma } from "@/server/prisma";
import type { WaiverRecord } from "./waiver.types";

/**
 * Relations joined so the API can report the employee name and the acting
 * users without a second request. Prisma infers the payload type from this.
 */
const WAIVER_INCLUDE = {
  employee: { select: { fullName: true } },
  waivedBy: { select: { username: true } },
  revokedBy: { select: { username: true } },
};

interface WaiverRow {
  waiverId: bigint;
  employeeId: number;
  waiverDate: Date;
  reason: string;
  waivedById: bigint;
  createdAt: Date;
  revokedAt: Date | null;
  revokedById: bigint | null;
  revocationReason: string | null;
  employee: { fullName: string };
  waivedBy: { username: string };
  revokedBy: { username: string } | null;
}

/** `@db.Date` columns are returned as UTC-midnight `Date` objects. */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toRecord(row: WaiverRow): WaiverRecord {
  return {
    waiverId: row.waiverId.toString(),
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    waiverDate: toDateString(row.waiverDate),
    reason: row.reason,
    waivedById: row.waivedById.toString(),
    waivedByName: row.waivedBy.username,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedById: row.revokedById ? row.revokedById.toString() : null,
    revokedByName: row.revokedBy ? row.revokedBy.username : null,
    revocationReason: row.revocationReason,
  };
}

/**
 * Every waiver audit row, active and revoked, newest waiver date first.
 *
 * Revoking never deletes a row, so a revoked waiver still appears here with
 * its full grant and revocation audit trail. This is read-only: granting and
 * revoking stay in the Daily Report.
 */
export async function listWaiverRecords(): Promise<WaiverRecord[]> {
  const rows = await prisma.waiver.findMany({
    include: WAIVER_INCLUDE,
    orderBy: [{ waiverDate: "desc" }, { waiverId: "desc" }],
  });

  return rows.map(toRecord);
}
