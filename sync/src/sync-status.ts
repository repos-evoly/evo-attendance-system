/**
 * Print sync status information.
 * Shows last successful sync time, age, last 5 sync runs, and total punches.
 */

import { getDatabase } from './db.js';

const db = getDatabase();

console.log('=== Sync Status ===\n');

// Last successful sync
const lastSuccessfulSync = db.prepare(`
  SELECT * FROM sync_runs
  WHERE status = 'ok' OR status = 'ok_with_warning'
  ORDER BY id DESC
  LIMIT 1
`).get() as { id: number; started_at: string; finished_at: string; status: string; users_seen: number; records_seen: number; records_new: number; suspect_new: number } | undefined;

if (lastSuccessfulSync) {
  const finishedTime = new Date(lastSuccessfulSync.finished_at);
  const now = new Date();
  const ageMinutes = Math.floor((now.getTime() - finishedTime.getTime()) / (1000 * 60));

  console.log('Last successful sync:');
  console.log(`  ID: ${lastSuccessfulSync.id}`);
  console.log(`  Finished at: ${lastSuccessfulSync.finished_at}`);
  console.log(`  Age: ${ageMinutes} minutes`);
  console.log(`  Status: ${lastSuccessfulSync.status}`);
  console.log(`  Users seen: ${lastSuccessfulSync.users_seen}`);
  console.log(`  Records seen: ${lastSuccessfulSync.records_seen}`);
  console.log(`  Records new: ${lastSuccessfulSync.records_new}`);
  console.log(`  Suspect new: ${lastSuccessfulSync.suspect_new}`);
} else {
  console.log('No successful sync runs found');
}

console.log();

// Last 5 sync runs
console.log('Last 5 sync runs:');
const last5Runs = db.prepare(`
  SELECT id, started_at, finished_at, status, users_seen, records_seen, records_new, suspect_new
  FROM sync_runs
  ORDER BY id DESC
  LIMIT 5
`).all() as Array<{ id: number; started_at: string; finished_at: string; status: string; users_seen: number; records_seen: number; records_new: number; suspect_new: number }>;

for (const run of last5Runs) {
  const finishedTime = new Date(run.finished_at);
  const now = new Date();
  const ageMinutes = run.finished_at ? Math.floor((now.getTime() - finishedTime.getTime()) / (1000 * 60)) : null;

  console.log(`  ID ${run.id}: ${run.status}`);
  console.log(`    Started: ${run.started_at}`);
  console.log(`    Finished: ${run.finished_at || 'N/A'}`);
  console.log(`    Age: ${ageMinutes !== null ? `${ageMinutes} minutes` : 'N/A'}`);
  console.log(`    Users: ${run.users_seen}, Records: ${run.records_seen}, New: ${run.records_new}, Suspect: ${run.suspect_new}`);
}

console.log();

// Total punches
const totalPunches = db.prepare('SELECT COUNT(*) as count FROM punches').get() as { count: number };
console.log(`Total punches in database: ${totalPunches.count}`);

db.close();
