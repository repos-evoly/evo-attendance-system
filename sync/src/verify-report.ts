/**
 * Verify report for 2026-10-26 to 2026-11-01
 */

import Database from 'better-sqlite3';
import { getDatabase } from './db.js';
import { buildReport } from './report.js';
import { DEFAULT_CONFIG } from './config.js';

console.log('=== Report Verification ===\n');

const db = getDatabase();
const fromDate = new Date('2026-10-26');
const toDate = new Date('2026-11-01');

const { reportRows, totalsRows } = buildReport(db, fromDate, toDate, DEFAULT_CONFIG);

console.log(`Report rows: ${reportRows.length}`);
console.log(`Totals rows: ${totalsRows.length}\n`);

// Count rows with fewer than 2 distinct punches
const rowsWithFewerThan2Punches = reportRows.filter(r => r.punches < 2);
console.log(`Rows with fewer than 2 punches: ${rowsWithFewerThan2Punches.length}`);

// Check if any of these have non-empty hours
const rowsWithHours = rowsWithFewerThan2Punches.filter(r => r.hours !== '' || r.minutes !== '');
console.log(`Rows with fewer than 2 punches that have non-empty hours/minutes: ${rowsWithHours.length}`);

if (rowsWithHours.length > 0) {
  console.log('\n  Violations:');
  for (const row of rowsWithHours) {
    console.log(`    PIN ${row.pin}, Date ${row.date}: hours="${row.hours}", minutes="${row.minutes}", note="${row.note}"`);
  }
}

// Count complete days (>= 2 punches)
const completeDays = reportRows.filter(r => r.punches >= 2);
console.log(`\nRows with >= 2 punches (complete days): ${completeDays.length}`);

// Check if any complete days have empty hours
const completeDaysWithEmptyHours = completeDays.filter(r => r.hours === '' || r.minutes === '');
console.log(`Complete days with empty hours/minutes: ${completeDaysWithEmptyHours.length}`);

if (completeDaysWithEmptyHours.length > 0) {
  console.log('\n  Violations:');
  for (const row of completeDaysWithEmptyHours) {
    console.log(`    PIN ${row.pin}, Date ${row.date}: hours="${row.hours}", minutes="${row.minutes}", note="${row.note}"`);
  }
}

// Note counts
const noteCounts: Record<string, number> = {};
for (const row of reportRows) {
  noteCounts[row.note] = (noteCounts[row.note] || 0) + 1;
}
console.log('\nNote counts:');
for (const [note, count] of Object.entries(noteCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${note}: ${count}`);
}

db.close();

console.log('\n=== Verification Complete ===');
