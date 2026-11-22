/**
 * Production read-only synchronization: ZKTeco MB20 device -> PostgreSQL.
 *
 * Reads device info, users and attendance records, then persists the RAW
 * attendance records into PostgreSQL `device_punches` and records the run in
 * `sync_runs`.
 *
 * Incremental behavior (honest summary):
 * - The installed `@graphland/zkteco` client and the MB20 do NOT support a
 *   reliable device-side "fetch only new records" cursor. `getAttendances()`
 *   always requests the full log, and `getUserAttendances({from,to})` merely
 *   filters that full result in memory. So we always read every record — the
 *   existing full-fetch method is kept as the safe fallback.
 * - Instead of a device cursor we use a CHECKPOINT derived from committed rows
 *   (`MAX(punched_at_local)`). Because it is derived, it can only advance AFTER
 *   a successful COMMIT: an interrupted sync leaves it untouched.
 * - Every fetched record is always inserted. We deliberately do NOT skip records
 *   by the checkpoint, because a device reset can re-emit (or backdate) older
 *   punches and filtering by timestamp could lose them. Inserts are idempotent
 *   (unique index + ON CONFLICT DO NOTHING) and never update/delete rows.
 * - A no-loss guard warns (status `ok_with_warning`) when the device returns
 *   fewer records than are already stored for the serial (possible reset or log
 *   rollover), while still preserving everything already stored.
 *
 * Reliability (intermittent TCP reassembly failures):
 * - The vendored `@graphland/zkteco` TCP reader can occasionally finish a chunked
 *   download with packets outstanding (`TIME OUT !! N PACKETS REMAIN !`) when TCP
 *   delivery is coalesced/partial. It uses a single-packet-per-`data`-event
 *   parser with exact-length completion checks, so a mis-assembled frame wedges
 *   the reader until its inactivity timer fires. That is a transport hiccup, not
 *   a data problem, so we retry the whole device read with a BRAND NEW client
 *   (max 3 attempts, short delay, transient-only). The previous client is always
 *   disconnected before the next attempt.
 * - No attendance row is ever written until a COMPLETE download has succeeded,
 *   so a failed/incomplete attempt can never leave partial data or move the
 *   checkpoint.
 *
 * Safety:
 * - Read-only on the device. Uses the existing safe client + wire-level
 *   allowlist in TCP-only mode (UDP fallback is disabled).
 * - getTime() is never called (known decoding issue); CMD_GET_TIME is not in
 *   the allowed set.
 * - Raw punches are append-only and de-duplicated by the database.
 * - Device user IDs are stored as-is; nothing is written to the HR employees table.
 *
 * This module exports `runSync()` so it can be reused both by the CLI (see the
 * entry guard at the bottom) and by the automatic scheduler (`sync-scheduler.ts`).
 */

import { createSafeZKClient, type ISafeZKClient } from './safeClient.js';
import type { DeviceInfo } from '@graphland/zkteco';
import * as allowlistTransport from './allowlistTransport.js';
import * as pgDb from './pgDb.js';
import type { DevicePunchInput } from './pgDb.js';
import * as syncLock from './syncLock.js';
import type { Pool, PoolClient } from 'pg';
import * as path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Device identity (same hardcoded constants used by the existing sync scripts).
const DEVICE_IP = '10.1.201.89';
const DEVICE_PORT = 4370;
const DEVICE_SERIAL = 'EUF7241800043';
const TIMEOUT_MS = 120000; // 2 minutes max for the whole operation
const CLIENT_TIMEOUT_MS = 10000; // per-command handshake timeout for the device client
const MAX_ATTEMPTS = 3; // maximum TOTAL device-read attempts (1 initial + 2 retries)
const RETRY_DELAY_MS = 2000; // short pause before retrying with a fresh client

// Read-only command IDs only. CMD_GET_TIME (201) is intentionally excluded
// because getTime() is never called.
const ALLOWED_COMMAND_IDS = new Set<number>([
  1000, // CMD_CONNECT
  1102, // CMD_AUTH
  50,   // CMD_GET_FREE_SIZES
  1502, // CMD_FREE_DATA
  1503, // CMD_DATA_WRRQ
  1504, // CMD_DATA_RDY
  1001, // CMD_EXIT
]);

/**
 * The subset of the PostgreSQL persistence module the runner needs.
 * Declared as an interface so tests can substitute an in-memory implementation.
 */
export interface SyncPersistence {
  loadDatabaseUrl(): string;
  createPool(connectionString: string): Pool;
  startSyncRun(client: PoolClient, deviceIp: string, deviceSerial: string | null): Promise<number>;
  finishSyncRun(
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
  ): Promise<void>;
  insertDevicePunch(client: PoolClient, punch: DevicePunchInput): Promise<boolean>;
  getPunchCheckpoint(client: PoolClient, deviceSerial: string | null): Promise<string | null>;
  countDevicePunches(client: PoolClient, deviceSerial: string | null): Promise<number>;
}

/**
 * The subset of the file-lock module the runner needs. The lock is the single
 * mechanism that serializes automatic and manual runs (both call runSync()).
 */
export interface SyncLock {
  createLock(): boolean;
  removeLock(): void;
}

/**
 * The subset of the wire-level allowlist module the runner needs for the
 * post-read safety verification.
 */
export interface SyncAllowlist {
  getCommandCounts(): Map<number, number>;
  getBlockedCommands(): Set<number>;
  resetCommandCounts(): void;
  resetBlockedCommands(): void;
}

/** Injectable dependencies. Defaults are the real production modules. */
export interface SyncDependencies {
  deviceIp: string;
  devicePort: number;
  deviceSerial: string;
  timeoutMs: number;
  retryDelayMs: number;
  allowedCommandIds: Set<number>;
  createClient(ip: string, port: number, timeout: number): ISafeZKClient;
  persistence: SyncPersistence;
  lock: SyncLock;
  allowlist: SyncAllowlist;
  log(message: string): void;
  logError(message: string): void;
}

/** Production dependencies (used by the CLI and the automatic scheduler). */
export const defaultSyncDependencies: SyncDependencies = {
  deviceIp: DEVICE_IP,
  devicePort: DEVICE_PORT,
  deviceSerial: DEVICE_SERIAL,
  timeoutMs: TIMEOUT_MS,
  retryDelayMs: RETRY_DELAY_MS,
  allowedCommandIds: ALLOWED_COMMAND_IDS,
  createClient: (ip, port, timeout) => createSafeZKClient(ip, port, timeout),
  persistence: pgDb,
  lock: syncLock,
  allowlist: allowlistTransport,
  log: (message) => console.log(message),
  logError: (message) => console.error(message),
};

/** Abort if any command ID sent is outside the read-only allowlist. */
function verifyCommandIds(deps: SyncDependencies): void {
  for (const [cmdId] of deps.allowlist.getCommandCounts()) {
    if (!deps.allowedCommandIds.has(cmdId)) {
      throw new Error(`ABORT: Command ID ${cmdId} is outside the read-only allowlist`);
    }
  }
}

/** Abort if the allowlist blocked anything. */
function verifyNoBlockedCommands(deps: SyncDependencies): void {
  const blocked = deps.allowlist.getBlockedCommands();
  if (blocked.size > 0) {
    throw new Error(`ABORT: Allowlist blocked commands: ${Array.from(blocked).join(', ')}`);
  }
}

/**
 * Error messages that must NEVER be retried. These are security / allowlist /
 * authentication / device-configuration problems: a retry cannot fix them, and
 * re-sending a blocked or forged command would be unsafe.
 */
const NON_RETRYABLE_PATTERNS = [
  'forbidden command id',
  'fail closed',
  'allowlist blocked',
  'outside the read-only allowlist',
  'invalid communication key',
  'invalid connect response',
  'invalid device response',
  'device rejected',
  'not a zkteco device',
  'wrong port',
];

/**
 * Transient transport failures that are safe to retry with a fresh client.
 * The first two cover the library's chunk-reader timeouts, including the
 * intermittent `TIME OUT !! N PACKETS REMAIN !` reassembly failure.
 */
const TRANSIENT_PATTERNS = [
  'time out', // "TIME OUT !! N PACKETS REMAIN !"
  'timeout', // TIMEOUT WHEN RECEIVING PACKET / TIMEOUT_ON_WRITING_MESSAGE / ...
  'socket is disconnected',
  'socket is not connected',
  'econnreset',
  'econnrefused',
  'etimedout',
  'epipe',
  'eai_again',
  'enetunreach',
  'ehostunreach',
];

/**
 * Decide whether a device-read failure is a retryable transport hiccup or a
 * permanent/security failure. Non-retryable patterns win, so an allowlist
 * violation can never be retried even if its message also looks transient.
 */
function isRetryableTransportError(message: string): boolean {
  const text = message.toLowerCase();
  if (NON_RETRYABLE_PATTERNS.some((pattern) => text.includes(pattern))) return false;
  return TRANSIENT_PATTERNS.some((pattern) => text.includes(pattern));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DeviceReadResult {
  info: DeviceInfo;
  users: Array<{ pin: string; name: string }>;
  attendances: Array<{ deviceUserId: string; recordTime: Date; punch: number; status: number }>;
}

/**
 * Read the device (info, users and the COMPLETE attendance log) with a bounded
 * number of attempts.
 *
 * - Each attempt uses a BRAND NEW read-only TCP client and a clean connection.
 *   A timed-out/interrupted download leaves the socket in an unknown state, so
 *   reusing the client is not safe.
 * - The previous attempt's client is always disconnected (in `finally`) before
 *   the next attempt starts or before returning.
 * - Only transient transport failures are retried; security/allowlist/auth
 *   failures abort immediately.
 * - No attempt is started after `deadline` (the overall timeout budget).
 */
async function readDeviceWithRetry(
  deps: SyncDependencies,
  deadline: number,
  log: (message: string) => void,
  logError: (message: string) => void,
): Promise<DeviceReadResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadline) {
      throw new Error(
        `ABORT: Operation timed out after ${deps.timeoutMs}ms ` +
          `(attempt ${attempt}/${MAX_ATTEMPTS} not started)`,
      );
    }

    log(`Device read attempt ${attempt}/${MAX_ATTEMPTS} (fresh TCP client)...`);
    const client = deps.createClient(deps.deviceIp, deps.devicePort, CLIENT_TIMEOUT_MS);
    try {
      log('Connecting to device (TCP-only)...');
      await client.connect();
      log('✓ Connected');

      log('Reading device info...');
      const info = await client.getInfo();
      log(`✓ Device info: users=${info.userCounts}, logs=${info.logCounts}, capacity=${info.logCapacity}`);

      log('Reading device users...');
      const users = await client.getUsers();
      log(`✓ Users read: ${users.length}`);

      log('Reading attendance records...');
      const attendances = await client.getAttendances((received, total) => {
        log(`  Progress: ${received}/${total}`);
      });
      log(`✓ Attendance records read: ${attendances.length}`);

      return { info, users, attendances };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logError(`✗ Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError.message}`);

      if (!isRetryableTransportError(lastError.message)) {
        logError('✗ Not a transient transport failure; not retrying.');
        throw lastError;
      }
      if (attempt >= MAX_ATTEMPTS) {
        logError(`✗ All ${MAX_ATTEMPTS} attempts failed.`);
        break;
      }
    } finally {
      // Always tear down this attempt's client before the next attempt (or
      // before returning). The socket may be half-open after a timeout.
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }

    // Short pause before retrying, to let the device/socket settle.
    await delay(deps.retryDelayMs);
  }

  throw lastError ?? new Error('Attendance download failed');
}

/**
 * Run one full synchronization.
 *
 * Returns the process-style exit code used by the existing manual-sync API route
 * (POST /api/v1/sync/run):
 *   0 = success (possibly with warning), 1 = failed, 2 = skipped (lock held).
 *
 * `overrides` lets tests substitute the device client / persistence / lock while
 * keeping production defaults for everything else.
 */
export async function runSync(overrides: Partial<SyncDependencies> = {}): Promise<number> {
  const deps: SyncDependencies = { ...defaultSyncDependencies, ...overrides };
  const { log, logError } = deps;

  log('=== PostgreSQL Device Synchronization (read-only) ===');
  log(`Device: ${deps.deviceIp}:${deps.devicePort} (serial ${deps.deviceSerial})`);
  log(`Timeout: ${deps.timeoutMs}ms`);
  log('');

  deps.allowlist.resetCommandCounts();
  deps.allowlist.resetBlockedCommands();

  if (!deps.lock.createLock()) {
    log('⚠ Another sync is already running (lock file exists and is not stale).');
    return 2; // skipped
  }
  log('✓ Acquired sync lock');

  let pool: Pool | null = null;
  let dbClient: PoolClient | null = null;

  let syncRunId: number | null = null;

  let usersSeen = 0;
  let recordsSeen = 0;
  let recordsNew = 0;
  let duplicatesSkipped = 0;
  let invalidSkipped = 0;
  let deviceInfoText = '';
  let status: 'ok' | 'ok_with_warning' | 'failed' = 'ok';
  let warning: string | null = null;
  let checkpointBefore: string | null = null;
  let checkpointAfter: string | null = null;

  // Coherent overall timeout strategy. The library has no AbortSignal support,
  // so we cannot hard-cancel an in-flight socket read; instead we enforce a
  // single deadline that (a) prevents any further device-read attempt from
  // starting once the budget is exhausted and (b) is only ever reached after
  // the operation has fully settled. Combined with the per-attempt cap (3) and
  // the library's own per-command timers, this bounds the work without ever
  // releasing a client/pool/connection while the operation is still using it.
  const deadline = Date.now() + deps.timeoutMs;

  try {
    // 1. Connect to PostgreSQL first: if the database is unavailable, fail
    //    before ever contacting the device.
    const databaseUrl = deps.persistence.loadDatabaseUrl();
    pool = deps.persistence.createPool(databaseUrl);
    dbClient = await pool.connect();
    syncRunId = await deps.persistence.startSyncRun(dbClient, deps.deviceIp, deps.deviceSerial);
    log(`✓ Started sync run ${syncRunId}`);

    // Record the checkpoint (highest committed punch time) and how many punches
    // are already stored. Both are derived from committed rows only, so the
    // checkpoint can never move ahead of successfully saved data.
    checkpointBefore = await deps.persistence.getPunchCheckpoint(dbClient, deps.deviceSerial);
    const existingCount = await deps.persistence.countDevicePunches(dbClient, deps.deviceSerial);
    log(`Checkpoint before: ${checkpointBefore ?? '(none)'}`);
    log(`Punches already stored for this device: ${existingCount}`);

    const operation = (async () => {
      // 2. Read the device with retry. Each attempt uses a fresh read-only,
      //    TCP-only client and disconnects it before the next attempt. No
      //    database write happens until the COMPLETE download has succeeded.
      const { info, users, attendances } = await readDeviceWithRetry(
        deps,
        deadline,
        log,
        logError,
      );

      deviceInfoText = `users=${info.userCounts}, logs=${info.logCounts}, capacity=${info.logCapacity}`;
      usersSeen = users.length;
      recordsSeen = attendances.length;

      // Safety verification before any persistence.
      verifyCommandIds(deps);
      verifyNoBlockedCommands(deps);
      log('✓ All commands within the read-only allowlist; none blocked');

      // No-loss guard: the device should never return fewer records than are
      // already stored for this serial. If it does (device reset / log
      // rollover), warn — but still persist, because inserts are idempotent and
      // never destructive, so stored punches cannot be lost here.
      if (recordsSeen < existingCount) {
        status = 'ok_with_warning';
        warning =
          `Device returned ${recordsSeen} records but ${existingCount} are already stored ` +
          `for serial ${deps.deviceSerial}; possible device reset or log rollover. ` +
          'Existing records were preserved.';
        log(`⚠ ${warning}`);
      }

      // 3. Persist RAW punches in a single transaction. Idempotent: identical
      //    records are skipped by the unique index. We intentionally persist
      //    EVERY fetched record (no checkpoint filtering) to guarantee that a
      //    backdated/re-emitted punch can never be dropped.
      log('Persisting raw punches into PostgreSQL...');
      await dbClient!.query('BEGIN');
      try {
        for (const record of attendances) {
          const time = record.recordTime instanceof Date ? record.recordTime.getTime() : NaN;
          if (Number.isNaN(time)) {
            invalidSkipped++;
            continue;
          }

          const inserted = await deps.persistence.insertDevicePunch(dbClient!, {
            deviceUserId: record.deviceUserId,
            punchedAtLocal: pgDb.formatLocalWallClock(record.recordTime),
            punchType: record.punch,
            verifyStatus: record.status,
            deviceSerial: deps.deviceSerial,
          });

          if (inserted) recordsNew++;
          else duplicatesSkipped++;
        }
        await dbClient!.query('COMMIT');
      } catch (error) {
        await dbClient!.query('ROLLBACK');
        throw error;
      }
      log(`✓ Persisted: ${recordsNew} new, ${duplicatesSkipped} duplicates skipped`);
    })();

    // Await the WHOLE operation (device read with retries + transaction). We do
    // NOT race it against a timer: if the timeout won, the operation would keep
    // running and the finally-block below could release the pool/connection and
    // the lock while it is still in use. Cleanup must only happen once the
    // operation has fully settled.
    await operation;

    // The checkpoint is only read again AFTER a successful COMMIT, so it can
    // only ever advance once records have actually been saved.
    checkpointAfter = await deps.persistence.getPunchCheckpoint(dbClient, deps.deviceSerial);
    log(`Checkpoint after: ${checkpointAfter ?? '(none)'}`);

    await deps.persistence.finishSyncRun(dbClient, syncRunId, {
      status,
      usersSeen,
      recordsSeen,
      recordsNew,
      duplicatesSkipped,
      error: null,
    });
    log(`✓ Sync run ${syncRunId} recorded with status: ${status}`);
  } catch (error) {
    status = 'failed';
    const message = (error as Error).message;
    logError('');
    logError('=== ERROR ===');
    logError(message);

    if (dbClient && syncRunId !== null) {
      try {
        await deps.persistence.finishSyncRun(dbClient, syncRunId, {
          status: 'failed',
          usersSeen,
          recordsSeen,
          recordsNew,
          duplicatesSkipped,
          error: message,
        });
        log(`✓ Sync run ${syncRunId} recorded with status: failed`);
      } catch (recordError) {
        logError('Could not record failed sync run: ' + (recordError as Error).message);
      }
    }
  } finally {
    // At this point the operation has fully settled (awaited above), so no
    // device client, database client or pool is still in use. Each device-read
    // attempt already disconnected its own client, so there is nothing to
    // disconnect here.

    // Always release database connections.
    if (dbClient) {
      dbClient.release();
      dbClient = null;
    }
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore
      }
      pool = null;
    }

    deps.lock.removeLock();
    log('✓ Released sync lock and database connections');
  }

  // Concise summary.
  log('');
  log('=== Synchronization Summary ===');
  log(`Device: ${deps.deviceIp}:${deps.devicePort} (serial ${deps.deviceSerial})`);
  log(`Device info: ${deviceInfoText || '(not read)'}`);
  log(`Users read: ${usersSeen}`);
  log(`Attendance records read: ${recordsSeen}`);
  log(`New records inserted: ${recordsNew}`);
  log(`Duplicates skipped: ${duplicatesSkipped}`);
  if (invalidSkipped > 0) log(`Invalid records skipped: ${invalidSkipped}`);
  log(`Checkpoint before: ${checkpointBefore ?? '(none)'}`);
  log(`Checkpoint after: ${checkpointAfter ?? '(none)'}`);
  if (warning) log(`Warning: ${warning}`);
  log(`Status: ${status}`);

  return status === 'failed' ? 1 : 0;
}

/**
 * True when this module is the process entry point (i.e. run as the CLI).
 * Prevents the CLI side effect from firing when the scheduler or tests import
 * `runSync()`.
 */
function isDirectlyInvoked(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry).toLowerCase() === realpathSync(self).toLowerCase();
  } catch {
    return path.resolve(entry).toLowerCase() === path.resolve(self).toLowerCase();
  }
}

if (isDirectlyInvoked()) {
  runSync()
    .then((exitCode) => {
      allowlistTransport.printCommandCounts();
      allowlistTransport.printBlockedCommands();
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('Unexpected failure:', error);
      process.exit(1);
    });
}
