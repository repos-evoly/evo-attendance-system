import { listWaiverRecords } from "./waiver.repository";
import type { WaiverRecord } from "./waiver.types";

/**
 * Lists every waiver record (active and revoked), newest waiver date first.
 *
 * Read-only: the Waivers page only inspects the audit trail. Granting and
 * revoking a waiver still go through the existing Daily Report action.
 */
export async function listWaivers(): Promise<WaiverRecord[]> {
  return listWaiverRecords();
}
