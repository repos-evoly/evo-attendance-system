/**
 * PostgreSQL persistence for the sync service.
 *
 * This module is intentionally independent of the Next.js app. The connection
 * string is read from the environment (DATABASE_URL); it is never hardcoded.
 * The only tables it touches are `device_punches` (append-only) and `sync_runs`.
 */

import { Pool, type PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Locate the repository .env file. The sync scripts run from inside `sync/`,
 * so the first candidate is the parent directory's .env.
 */
function findEnvFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the PostgreSQL connection string from the environment.
 * Falls back to loading the repository .env file when needed.
 * Throws (fail closed) when it cannot be found — credentials are never hardcoded.
 */
export function loadDatabaseUrl(): string {
  let url = process.env.DATABASE_URL;

  if (!url) {
    const envFile = findEnvFile();
    if (envFile) {
      process.loadEnvFile(envFile);
      url = process.env.DATABASE_URL;
    }
  }

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provide it via the environment or the repository .env file.',
    );
  }

  return url;
}

/**
 * Create a small connection pool using the configured connection string.
 */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 2 });
}

/**
 * Format a Date as local wall-clock time 'YYYY-MM-DD HH:mm:ss'.
 * Uses LOCAL getters, NOT toISOString, so the device's wall-clock time is
 * preserved verbatim and never converted to UTC.
 */
export function formatLocalWallClock(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Insert a 'running' sync run row and return its id.
 * Committed immediately (autocommit) so the attempt is recorded even if the
 * rest of the synchronization fails.
 */
export async function startSyncRun(
  client: PoolClient,
  deviceIp: string,
  deviceSerial: string | null,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO sync_runs (status, device_ip, device_serial)
     VALUES ('running', $1, $2)
     RETURNING id`,
    [deviceIp, deviceSerial],
  );
  return Number(result.rows[0]!.id);
}

/**
 * Finalize a sync run with its outcome and counts.
 */
export async function finishSyncRun(
  client: PoolClient,
  id: number,
  result: {
    status: string;
    usersSeen: number;
    recordsSeen: number;
    recordsNew: number;
    duplicatesSkipped: number;
    error?: string | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE sync_runs
     SET finished_at = NOW(),
         status = $2,
         users_seen = $3,
         records_seen = $4,
         records_new = $5,
         duplicates_skipped = $6,
         error = $7
     WHERE id = $1`,
    [
      id,
      result.status,
      result.usersSeen,
      result.recordsSeen,
      result.recordsNew,
      result.duplicatesSkipped,
      result.error ?? null,
    ],
  );
}

export interface DevicePunchInput {
  deviceUserId: string;
  punchedAtLocal: string;
  punchType: number;
  verifyStatus: number;
  deviceSerial: string | null;
}

/**
 * Insert one raw device punch.
 * Returns true when a new row was inserted, false when an identical record
 * already existed (duplicate skipped). Never updates existing rows.
 */
export async function insertDevicePunch(
  client: PoolClient,
  punch: DevicePunchInput,
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO device_punches
       (device_user_id, punched_at_local, punch_type, verify_status, device_serial)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_user_id, punched_at_local, punch_type, verify_status)
     DO NOTHING
     RETURNING id`,
    [
      punch.deviceUserId,
      punch.punchedAtLocal,
      punch.punchType,
      punch.verifyStatus,
      punch.deviceSerial,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * The incremental checkpoint for a device: the highest local wall-clock punch
 * time already committed for that serial. Derived from committed rows, so it
 * can only advance after records have been successfully saved. Returns null
 * when nothing has been stored for the device yet.
 */
export async function getPunchCheckpoint(
  client: PoolClient,
  deviceSerial: string | null,
): Promise<string | null> {
  const result = await client.query<{ checkpoint: string | null }>(
    `SELECT MAX(punched_at_local)::text AS checkpoint
     FROM device_punches
     WHERE device_serial = $1`,
    [deviceSerial],
  );
  return result.rows[0]?.checkpoint ?? null;
}

/**
 * Number of device punches already stored for a serial. Used by the no-loss
 * guard to detect a device that returns fewer records than are stored locally.
 */
export async function countDevicePunches(
  client: PoolClient,
  deviceSerial: string | null,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM device_punches
     WHERE device_serial = $1`,
    [deviceSerial],
  );
  return Number(result.rows[0]?.count ?? 0);
}
