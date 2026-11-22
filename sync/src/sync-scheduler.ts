/**
 * Automatic attendance synchronization (runs inside the sync/ service).
 *
 * Runs the existing read-only PostgreSQL sync every 5 minutes. It never runs
 * inside the Next.js app, and it reuses `runSync()`, so:
 * - Every run is serialized against manual syncs by the existing file lock
 *   (`syncLock`): if a manual or automatic sync is already in progress, the new
 *   attempt is skipped and returns exit code 2 instead of overlapping.
 * - Every run (success, warning, failure or skip) is logged to `sync_runs`
 *   exactly like a manual run.
 * - Device/DATABASE connection errors are caught and logged; the scheduler keeps
 *   running and simply retries on the next interval.
 *
 * Manual sync remains available unchanged (POST /api/v1/sync/run).
 */

import { runSync } from './sync-postgres.js';

const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Guards against overlapping ticks in this process (the file lock additionally
// serializes against other processes, e.g. a manual sync).
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) {
    console.log('[auto-sync] Previous run still in progress; skipping this tick.');
    return;
  }
  ticking = true;
  console.log(`[auto-sync] Tick at ${new Date().toISOString()}`);
  try {
    const exitCode = await runSync();
    if (exitCode === 0) {
      console.log('[auto-sync] Sync finished successfully.');
    } else if (exitCode === 2) {
      console.log('[auto-sync] Skipped: another sync is currently running.');
    } else {
      console.log(`[auto-sync] Sync failed (exit ${exitCode}); will retry on the next interval.`);
    }
  } catch (error) {
    // Never let a failure crash the scheduler.
    console.error('[auto-sync] Unexpected error (continuing):', (error as Error).message);
  } finally {
    ticking = false;
  }
}

console.log(`[auto-sync] Automatic sync started; running every ${INTERVAL_MS / 60000} minutes.`);
setInterval(() => {
  void tick();
}, INTERVAL_MS);
