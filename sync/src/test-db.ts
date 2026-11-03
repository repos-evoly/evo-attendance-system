/**
 * Test database operations with in-memory SQLite.
 * Tests:
 * 1. Insert 10 fake punches twice - second insert must add 0 rows
 * 2. Future-dated punch gets suspect = 1
 * 3. 2019-dated punch gets suspect = 1
 */

import Database from 'better-sqlite3';
import {
  formatLocalDateTime,
  isSuspectDate,
  upsertEmployee,
  insertPunch,
  insertSyncRun,
  updateSyncRun,
  getSummary,
} from './db.js';

console.log('=== Database Tests (In-Memory SQLite) ===\n');

// Create in-memory database
const db = new Database(':memory:');

// Create schema manually (since getDatabase creates a file)
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    pin TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    updated_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin TEXT NOT NULL,
    punched_at TEXT NOT NULL,
    punch_code INTEGER,
    verify_code INTEGER,
    source TEXT NOT NULL DEFAULT 'device',
    suspect INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL,
    UNIQUE(pin, punched_at)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    users_seen INTEGER,
    records_seen INTEGER,
    records_new INTEGER,
    suspect_new INTEGER,
    error TEXT
  )
`);

console.log('✓ Created in-memory database with schema\n');

// Test 1: Insert 10 fake punches twice
console.log('Test 1: Insert 10 fake punches twice...');
const testPin = '123';
const testPunches: Date[] = [];
const now = new Date();

for (let i = 0; i < 10; i++) {
  const punchTime = new Date(now.getTime() - i * 60 * 60 * 1000); // 1 hour apart
  testPunches.push(punchTime);
}

// First insert
let firstInsertCount = 0;
for (const punchTime of testPunches) {
  const isNew = insertPunch(db, testPin, punchTime, 0, 1, 'test');
  if (isNew) firstInsertCount++;
}
console.log(`  First insert: ${firstInsertCount} rows added`);
console.log(`  Expected: 10 rows`);
console.log(`  Pass: ${firstInsertCount === 10 ? '✓' : '✗'}`);

// Second insert (should add 0 rows due to UNIQUE constraint)
let secondInsertCount = 0;
for (const punchTime of testPunches) {
  const isNew = insertPunch(db, testPin, punchTime, 0, 1, 'test');
  if (isNew) secondInsertCount++;
}
console.log(`  Second insert: ${secondInsertCount} rows added`);
console.log(`  Expected: 0 rows (duplicate prevention)`);
console.log(`  Pass: ${secondInsertCount === 0 ? '✓' : '✗'}\n`);

// Test 2: Future-dated punch gets suspect = 1
console.log('Test 2: Future-dated punch gets suspect = 1...');
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 2); // 2 days in the future
const futurePunchIsNew = insertPunch(db, '124', futureDate, 0, 1, 'test');
console.log(`  Future date: ${formatLocalDateTime(futureDate)}`);
console.log(`  isSuspectDate(): ${isSuspectDate(futureDate) ? 'true' : 'false'}`);
console.log(`  Inserted: ${futurePunchIsNew ? 'yes' : 'no'}`);

// Check suspect flag
const futurePunchRow = db.prepare('SELECT suspect FROM punches WHERE pin = ? AND punched_at = ?').get('124', formatLocalDateTime(futureDate)) as { suspect: number } | undefined;
if (futurePunchRow) {
  console.log(`  Suspect flag: ${futurePunchRow.suspect}`);
  console.log(`  Expected: 1`);
  console.log(`  Pass: ${futurePunchRow.suspect === 1 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find future punch in database\n`);
}

// Test 3: 2019-dated punch gets suspect = 1
console.log('Test 3: 2019-dated punch gets suspect = 1...');
const oldDate = new Date('2019-06-15T10:30:00');
const oldPunchIsNew = insertPunch(db, '125', oldDate, 0, 1, 'test');
console.log(`  Old date: ${formatLocalDateTime(oldDate)}`);
console.log(`  isSuspectDate(): ${isSuspectDate(oldDate) ? 'true' : 'false'}`);
console.log(`  Inserted: ${oldPunchIsNew ? 'yes' : 'no'}`);

// Check suspect flag
const oldPunchRow = db.prepare('SELECT suspect FROM punches WHERE pin = ? AND punched_at = ?').get('125', formatLocalDateTime(oldDate)) as { suspect: number } | undefined;
if (oldPunchRow) {
  console.log(`  Suspect flag: ${oldPunchRow.suspect}`);
  console.log(`  Expected: 1`);
  console.log(`  Pass: ${oldPunchRow.suspect === 1 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find old punch in database\n`);
}

// Test 4: Upsert employee
console.log('Test 4: Upsert employee...');
upsertEmployee(db, '123', 'Test User');
const employee = db.prepare('SELECT * FROM employees WHERE pin = ?').get('123') as { pin: string; name: string; active: number } | undefined;
if (employee) {
  console.log(`  PIN: ${employee.pin}`);
  console.log(`  Name: ${employee.name}`);
  console.log(`  Active: ${employee.active}`);
  console.log(`  Pass: ${employee.pin === '123' && employee.name === 'Test User' && employee.active === 1 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find employee\n`);
}

// Test 5: Sync run insert and update
console.log('Test 5: Sync run insert and update...');
const syncRunId = insertSyncRun(db);
console.log(`  Inserted sync run ID: ${syncRunId}`);
console.log(`  Pass: ${syncRunId > 0 ? '✓' : '✗'}`);

updateSyncRun(db, syncRunId, 'ok', 10, 100, 50, 2);
const syncRun = db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(syncRunId) as { status: string; users_seen: number; records_seen: number; records_new: number; suspect_new: number } | undefined;
if (syncRun) {
  console.log(`  Status: ${syncRun.status}`);
  console.log(`  Users seen: ${syncRun.users_seen}`);
  console.log(`  Records seen: ${syncRun.records_seen}`);
  console.log(`  Records new: ${syncRun.records_new}`);
  console.log(`  Suspect new: ${syncRun.suspect_new}`);
  console.log(`  Pass: ${syncRun.status === 'ok' && syncRun.users_seen === 10 && syncRun.records_seen === 100 && syncRun.records_new === 50 && syncRun.suspect_new === 2 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find sync run\n`);
}

// Test 6: Summary
console.log('Test 6: Database summary...');
const summary = getSummary(db);
console.log(`  Employees count: ${summary.employeesCount}`);
console.log(`  Punches count: ${summary.punchesCount}`);
console.log(`  Suspect count: ${summary.suspectCount}`);
console.log(`  Earliest punch: ${summary.earliestPunch}`);
console.log(`  Latest punch: ${summary.latestPunch}`);
console.log(`  Distinct pins not in employees: ${summary.distinctPinsNotInEmployees}`);
console.log(`  Punches by year-month:`);
for (const row of summary.punchesByYearMonth) {
  console.log(`    ${row.yearMonth}: ${row.count}`);
}
console.log(`  Pass: ${summary.employeesCount === 1 && summary.punchesCount === 12 && summary.suspectCount === 2 ? '✓' : '✗'}\n`);

// Test 7: Upsert employee never changes active column
console.log('Test 7: Upsert employee never changes active column...');
upsertEmployee(db, '456', 'Test Employee');
const employee7 = db.prepare('SELECT * FROM employees WHERE pin = ?').get('456') as { pin: string; name: string; active: number } | undefined;
if (employee7) {
  console.log(`  Initial upsert: PIN ${employee7.pin}, Name: ${employee7.name}, Active: ${employee7.active}`);
  console.log(`  Pass: ${employee7.pin === '456' && employee7.name === 'Test Employee' && employee7.active === 1 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find employee\n`);
}

// Manually set active to 0
db.prepare('UPDATE employees SET active = 0 WHERE pin = ?').run('456');
const employee7after = db.prepare('SELECT active FROM employees WHERE pin = ?').get('456') as { active: number } | undefined;
console.log('  Set active to 0 manually');
if (employee7after) {
  console.log(`  Active after manual update: ${employee7after.active}`);
  console.log(`  Pass: ${employee7after.active === 0 ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find employee\n`);
}

// Upsert again with same PIN, different name
upsertEmployee(db, '456', 'Updated Name');
const employee7final = db.prepare('SELECT name, active FROM employees WHERE pin = ?').get('456') as { name: string; active: number } | undefined;
console.log('  Upsert again with same PIN, different name');
if (employee7final) {
  console.log(`  Active after upsert: ${employee7final.active}`);
  console.log(`  Expected: 0 (should not change)`);
  console.log(`  Pass: ${employee7final.active === 0 && employee7final.name === 'Updated Name' ? '✓' : '✗'}\n`);
} else {
  console.log(`  ✗ FAIL: Could not find employee\n`);
}

// Summary
console.log('=== Test Summary ===');
const test1Pass = firstInsertCount === 10 && secondInsertCount === 0;
const test2Pass = futurePunchRow?.suspect === 1;
const test3Pass = oldPunchRow?.suspect === 1;
const test4Pass = employee?.pin === '123' && employee?.name === 'Test User';
const test5Pass = syncRun?.status === 'ok' && syncRun?.users_seen === 10;
const test6Pass = summary.employeesCount === 1 && summary.punchesCount === 12 && summary.suspectCount === 2;
const test7Pass = employee7final?.active === 0 && employee7final?.name === 'Updated Name';

const allPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass && test7Pass;

if (allPassed) {
  console.log('✓ ALL TESTS PASSED');
  db.close();
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  console.log(`  Test 1 (duplicate prevention): ${test1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 2 (future suspect): ${test2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 3 (old suspect): ${test3Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 4 (employee upsert): ${test4Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 5 (sync run): ${test5Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 6 (summary): ${test6Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 7 (active column unchanged): ${test7Pass ? 'PASS' : 'FAIL'}`);
  db.close();
  process.exit(1);
}
