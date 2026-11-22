/**
 * Focused tests for the PostgreSQL sync runner (`runSync`).
 *
 * They exercise the safety-critical behavior required for reliable syncing:
 *   - new records are inserted
 *   - duplicate records are skipped (idempotent)
 *   - an interrupted sync is rolled back (no partial data, checkpoint unchanged)
 *   - a device connection failure is logged as a failed run and never crashes
 *   - concurrent sync attempts are rejected by the existing file lock
 *   - the no-loss guard warns but never discards stored punches (device reset)
 *
 * They use Node's built-in test runner and substitute an in-memory persistence
 * layer + a fake device client, so no real device or database is contacted.
 * Run with:  npm test   (inside sync/)
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { runSync, type SyncDependencies, type SyncPersistence } from './sync-postgres.js';
import type { DevicePunchInput } from './pgDb.js';
import type { ISafeZKClient } from './safeClient.js';
import type { DeviceInfo } from '@graphland/zkteco';
import type { Pool, PoolClient } from 'pg';
import * as syncLock from './syncLock.js';

type PunchRow = DevicePunchInput;
type DeviceRecord = { deviceUserId: string; recordTime: Date; punch: number; status: number };

interface RunRow {
  id: number;
  status: string;
  deviceIp: string;
  deviceSerial: string | null;
  error: string | null;
  usersSeen: number;
  recordsSeen: number;
  recordsNew: number;
  duplicatesSkipped: number;
  finished: boolean;
}

/** In-memory stand-in for `device_punches` + `sync_runs` with transaction support. */
class FakeStore {
  committed: PunchRow[] = [];
  pending: PunchRow[] | null = null;
  runs: RunRow[] = [];
  nextRunId = 1;
  /** When set, the Nth insert call throws (to simulate an interrupted sync). */
  failInsertOnCall: number | null = null;
  insertCalls = 0;
  /** Resource-cleanup counters (asserted by the lifecycle tests). */
  poolEndCalls = 0;
  dbClientReleaseCalls = 0;

  key(p: PunchRow): string {
    return [p.deviceUserId, p.punchedAtLocal, p.punchType, p.verifyStatus].join('|');
  }

  checkpoint(serial: string | null): string | null {
    const times = this.committed
      .filter((p) => p.deviceSerial === serial)
      .map((p) => p.punchedAtLocal)
      .sort();
    return times.length > 0 ? times[times.length - 1]! : null;
  }

  count(serial: string | null): number {
    return this.committed.filter((p) => p.deviceSerial === serial).length;
  }
}

class FakeDbClient {
  constructor(private store: FakeStore) {}

  async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
    const command = sql.trim().toUpperCase();
    if (command === 'BEGIN') {
      this.store.pending = [];
    } else if (command === 'COMMIT') {
      if (this.store.pending) this.store.committed.push(...this.store.pending);
      this.store.pending = null;
    } else if (command === 'ROLLBACK') {
      this.store.pending = null;
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.store.dbClientReleaseCalls += 1;
  }
}

class FakePool {
  constructor(private store: FakeStore) {}
  async connect(): Promise<PoolClient> {
    return new FakeDbClient(this.store) as unknown as PoolClient;
  }
  async end(): Promise<void> {
    this.store.poolEndCalls += 1;
  }
}

function makePersistence(store: FakeStore): SyncPersistence {
  return {
    loadDatabaseUrl: () => 'postgres://fake/attendance',

    createPool: () => new FakePool(store) as unknown as Pool,

    startSyncRun: async (_client, deviceIp, deviceSerial) => {
      const id = store.nextRunId++;
      store.runs.push({
        id,
        status: 'running',
        deviceIp,
        deviceSerial,
        error: null,
        usersSeen: 0,
        recordsSeen: 0,
        recordsNew: 0,
        duplicatesSkipped: 0,
        finished: false,
      });
      return id;
    },

    finishSyncRun: async (_client, id, result) => {
      const run = store.runs.find((r) => r.id === id);
      assert.ok(run, `sync run ${id} should exist`);
      run.status = result.status;
      run.usersSeen = result.usersSeen;
      run.recordsSeen = result.recordsSeen;
      run.recordsNew = result.recordsNew;
      run.duplicatesSkipped = result.duplicatesSkipped;
      run.error = result.error ?? null;
      run.finished = true;
    },

    insertDevicePunch: async (_client, punch) => {
      store.insertCalls += 1;
      if (store.failInsertOnCall !== null && store.insertCalls === store.failInsertOnCall) {
        throw new Error('simulated insert failure');
      }
      if (!store.pending) store.pending = [];
      const keys = new Set([...store.committed, ...store.pending].map((p) => store.key(p)));
      if (keys.has(store.key(punch))) return false;
      store.pending.push(punch);
      return true;
    },

    getPunchCheckpoint: async (_client, deviceSerial) => store.checkpoint(deviceSerial),

    countDevicePunches: async (_client, deviceSerial) => store.count(deviceSerial),
  };
}

class FakeDeviceClient implements ISafeZKClient {
  connected = false;
  disconnected = false;
  connectCalls = 0;

  constructor(
    private readonly records: DeviceRecord[],
    private readonly opts: { failConnect?: boolean; failFetch?: boolean; fetchError?: Error } = {},
  ) {}

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.opts.failConnect) throw new Error('ECONNREFUSED: device unreachable');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
  }

  async getInfo(): Promise<DeviceInfo> {
    return {
      userCounts: 3,
      logCounts: this.records.length,
      logCapacity: 100000,
    } as unknown as DeviceInfo;
  }

  async getTime(): Promise<Date> {
    return new Date();
  }

  async getUsers(): Promise<Array<{ pin: string; name: string }>> {
    return [{ pin: '1', name: 'Alice' }];
  }

  async getUsersDetailed(): Promise<never[]> {
    return [];
  }

  async getAttendances(): Promise<DeviceRecord[]> {
    if (this.opts.fetchError) throw this.opts.fetchError;
    if (this.opts.failFetch) throw new Error('fetch interrupted');
    return this.records;
  }
}

/** Build a device record + its expected persisted row (local wall clock). */
function punch(
  deviceUserId: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  punchType = 0,
  verifyStatus = 1,
): { record: DeviceRecord; row: PunchRow } {
  const recordTime = new Date(y, mo - 1, d, h, mi, s);
  const pad = (n: number) => String(n).padStart(2, '0');
  const punchedAtLocal = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
  return {
    record: { deviceUserId, recordTime, punch: punchType, status: verifyStatus },
    row: { deviceUserId, punchedAtLocal, punchType, verifyStatus, deviceSerial: 'EUF7241800043' },
  };
}

function makeDeps(store: FakeStore, device: ISafeZKClient): Partial<SyncDependencies> {
  return {
    persistence: makePersistence(store),
    createClient: () => device,
    retryDelayMs: 0,
    log: () => {},
    logError: () => {},
  };
}

let tmpDir: string;
let lockFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
  lockFile = path.join(tmpDir, 'sync.lock');
  syncLock._setLockFilePath(lockFile);
  syncLock._resetLockState();
  syncLock._resetIsProcessRunning();
});

afterEach(() => {
  try {
    syncLock.removeLock();
  } catch {
    /* ignore */
  }
  syncLock._resetLockState();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('inserts new records, logs an ok run and advances the checkpoint', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 9, 0, 0);
  const b = punch('1002', 2026, 1, 15, 9, 5, 30);
  const device = new FakeDeviceClient([a.record, b.record]);

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 0);
  assert.equal(store.committed.length, 2);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0]!.status, 'ok');
  assert.equal(store.runs[0]!.recordsNew, 2);
  assert.equal(store.runs[0]!.duplicatesSkipped, 0);
  assert.equal(store.runs[0]!.finished, true);
  // Checkpoint only advances after a successful commit.
  assert.equal(store.checkpoint('EUF7241800043'), '2026-01-15 09:05:30');
  assert.equal(fs.existsSync(lockFile), false, 'lock should be released');
});

test('skips duplicate records without creating new rows', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 9, 0, 0);
  const b = punch('1002', 2026, 1, 15, 9, 5, 30);
  store.committed.push(a.row, b.row); // already synced previously
  const device = new FakeDeviceClient([a.record, b.record]);

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 0);
  assert.equal(store.committed.length, 2, 'no new rows for duplicates');
  assert.equal(store.runs[0]!.status, 'ok');
  assert.equal(store.runs[0]!.recordsNew, 0);
  assert.equal(store.runs[0]!.duplicatesSkipped, 2);
});

test('interrupted sync is rolled back: no partial data and checkpoint unchanged', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 10, 0, 0);
  const b = punch('1002', 2026, 1, 15, 10, 1, 0);
  const c = punch('1003', 2026, 1, 15, 10, 2, 0);
  store.failInsertOnCall = 2; // fail after the first row of the transaction
  const device = new FakeDeviceClient([a.record, b.record, c.record]);

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 1);
  assert.equal(store.committed.length, 0, 'nothing should be committed');
  assert.equal(store.checkpoint('EUF7241800043'), null, 'checkpoint must not move');
  assert.equal(store.runs[0]!.status, 'failed');
  assert.match(store.runs[0]!.error ?? '', /simulated insert failure/);
  assert.equal(fs.existsSync(lockFile), false, 'lock should be released after failure');
});

test('device disconnection (connect failure) is logged as failed and never crashes', async () => {
  const store = new FakeStore();
  const device = new FakeDeviceClient([], { failConnect: true });

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 1);
  assert.equal(store.committed.length, 0);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0]!.status, 'failed');
  assert.match(store.runs[0]!.error ?? '', /ECONNREFUSED/);
  assert.equal(fs.existsSync(lockFile), false, 'lock should be released');
});

test('fetch failure mid-run is logged as failed and leaves stored data intact', async () => {
  const store = new FakeStore();
  const existing = punch('1009', 2026, 1, 14, 8, 0, 0);
  store.committed.push(existing.row);
  const device = new FakeDeviceClient([], { failFetch: true });

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 1);
  assert.equal(store.committed.length, 1, 'previously stored punch is preserved');
  assert.equal(store.runs[0]!.status, 'failed');
});

test('concurrent sync attempts: the second run is skipped by the lock', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 9, 0, 0);
  const device = new FakeDeviceClient([a.record]);

  // Simulate a sync already in progress (manual or automatic) holding the lock.
  assert.equal(syncLock.createLock(), true, 'pre-acquire the lock');

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 2, 'skipped because the lock is held');
  assert.equal(store.runs.length, 0, 'a skipped run must not touch the database');
  assert.equal(store.committed.length, 0);
  assert.equal(fs.existsSync(lockFile), true, 'the held lock is not removed by the skipped run');

  syncLock.removeLock();
});

test('no-loss guard warns when the device returns fewer records than stored', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 10, 9, 0, 0);
  const b = punch('1002', 2026, 1, 11, 9, 0, 0);
  const c = punch('1003', 2026, 1, 12, 9, 0, 0);
  store.committed.push(a.row, b.row, c.row); // 3 rows already stored
  // Device reset: it now returns only a single (newer) record.
  const fresh = punch('1004', 2026, 1, 16, 9, 0, 0);
  const device = new FakeDeviceClient([fresh.record]);

  const exitCode = await runSync(makeDeps(store, device));

  assert.equal(exitCode, 0, 'warning is not a failure');
  assert.equal(store.runs[0]!.status, 'ok_with_warning');
  // Nothing is ever deleted; the new record is added on top of the 3 existing.
  assert.equal(store.committed.length, 4, 'no stored punch is lost');
  assert.equal(store.runs[0]!.recordsNew, 1);
});

/**
 * Overrides that hand out a BRAND NEW fake device client on every call, so the
 * retry behavior (fresh client + clean connection per attempt) can be asserted.
 */
function makeRetryDeps(
  store: FakeStore,
  makeClient: (attemptIndex: number) => FakeDeviceClient,
): { deps: Partial<SyncDependencies>; clients: FakeDeviceClient[] } {
  const clients: FakeDeviceClient[] = [];
  const deps: Partial<SyncDependencies> = {
    persistence: makePersistence(store),
    retryDelayMs: 0,
    createClient: () => {
      const client = makeClient(clients.length);
      clients.push(client);
      return client;
    },
    log: () => {},
    logError: () => {},
  };
  return { deps, clients };
}

test('retries a transient download failure with a fresh client and succeeds', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 9, 0, 0);
  const b = punch('1002', 2026, 1, 15, 9, 5, 30);

  // First attempt fails the way the device does in production; the second
  // (fresh client) succeeds.
  const { deps, clients } = makeRetryDeps(store, (attempt) =>
    new FakeDeviceClient(
      [a.record, b.record],
      attempt === 0 ? { fetchError: new Error('TIME OUT !! 1 PACKETS REMAIN !') } : {},
    ),
  );

  const exitCode = await runSync(deps);

  assert.equal(exitCode, 0, 'the retry recovers the sync');
  assert.equal(clients.length, 2, 'one fresh client per attempt');
  assert.equal(clients[0]!.disconnected, true, 'failed attempt client disconnected before retry');
  assert.equal(clients[1]!.disconnected, true, 'successful attempt client disconnected');
  assert.equal(store.committed.length, 2, 'the COMPLETE download is persisted');
  assert.equal(store.runs[0]!.status, 'ok');
  assert.equal(store.runs[0]!.recordsNew, 2);
  assert.equal(store.runs[0]!.duplicatesSkipped, 0);
  assert.equal(store.checkpoint('EUF7241800043'), '2026-01-15 09:05:30');
  assert.equal(store.poolEndCalls, 1, 'pool closed exactly once');
  assert.equal(store.dbClientReleaseCalls, 1, 'db connection released exactly once');
  assert.equal(fs.existsSync(lockFile), false, 'lock released');
});

test('all attempts failing: 3 attempts, no inserts, checkpoint unchanged, resources freed', async () => {
  const store = new FakeStore();
  const a = punch('1001', 2026, 1, 15, 9, 0, 0);
  const existing = punch('1000', 2026, 1, 14, 8, 0, 0);
  store.committed.push(existing.row); // a previously stored punch must survive

  const { deps, clients } = makeRetryDeps(
    store,
    () =>
      new FakeDeviceClient([a.record], {
        fetchError: new Error('TIME OUT !! 2 PACKETS REMAIN !'),
      }),
  );

  const exitCode = await runSync(deps);

  assert.equal(exitCode, 1);
  assert.equal(clients.length, 3, 'maximum 3 total attempts');
  assert.ok(
    clients.every((c) => c.disconnected),
    'every attempt client is disconnected',
  );
  assert.equal(store.committed.length, 1, 'no partial or duplicate inserts; stored punch preserved');
  assert.equal(
    store.checkpoint('EUF7241800043'),
    '2026-01-14 08:00:00',
    'checkpoint must not advance on failure',
  );
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0]!.status, 'failed');
  assert.match(store.runs[0]!.error ?? '', /TIME OUT !! 2 PACKETS REMAIN/);
  assert.equal(store.poolEndCalls, 1, 'pool closed exactly once');
  assert.equal(store.dbClientReleaseCalls, 1, 'db connection released exactly once');
  assert.equal(fs.existsSync(lockFile), false, 'lock released after failure');
});

test('does not retry a non-retryable allowlist/security violation', async () => {
  const store = new FakeStore();

  const { deps, clients } = makeRetryDeps(
    store,
    () =>
      new FakeDeviceClient([], {
        fetchError: new Error('FORBIDDEN COMMAND ID: 1010 isForbiddenCommand=true'),
      }),
  );

  const exitCode = await runSync(deps);

  assert.equal(exitCode, 1);
  assert.equal(clients.length, 1, 'a security/allowlist failure must never be retried');
  assert.equal(store.committed.length, 0);
  assert.equal(store.runs[0]!.status, 'failed');
  assert.match(store.runs[0]!.error ?? '', /FORBIDDEN COMMAND ID/);
  assert.equal(fs.existsSync(lockFile), false);
});

test('overall deadline: no device attempt starts once the timeout budget is exhausted', async () => {
  const store = new FakeStore();

  const { deps, clients } = makeRetryDeps(store, () => new FakeDeviceClient([]));
  deps.timeoutMs = 0; // budget already exhausted before the first attempt

  const exitCode = await runSync(deps);

  assert.equal(exitCode, 1);
  assert.equal(clients.length, 0, 'the deadline prevents any device attempt from starting');
  assert.equal(store.committed.length, 0);
  assert.equal(store.runs[0]!.status, 'failed');
  assert.match(store.runs[0]!.error ?? '', /timed out after 0ms/);
  assert.equal(store.poolEndCalls, 1, 'pool is still closed after a timeout');
  assert.equal(store.dbClientReleaseCalls, 1, 'db connection is still released after a timeout');
  assert.equal(fs.existsSync(lockFile), false, 'lock is released even when the deadline trips');
});
