/**
 * Test report functionality with made-up punches in an in-memory database.
 * Tests: normal day, single punch on past date, single punch today, no punch on weekday,
 * no punch on weekend, two punches 1 minute apart, gap over 16 hours, unknown pin,
 * range spanning several weeks.
 */

import Database from 'better-sqlite3';
import { buildReport } from './report.js';
import { DEFAULT_CONFIG } from './config.js';
import { formatLocalDateTime } from './db.js';

console.log('=== Report Tests (In-Memory SQLite) ===\n');

// Helper
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Create in-memory database
const db = new Database(':memory:');

// Create schema
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

// Insert test employees
db.prepare('INSERT INTO employees (pin, name, active, updated_at) VALUES (?, ?, ?, ?)').run('1', 'Test User 1', 1, formatLocalDateTime(new Date()));
db.prepare('INSERT INTO employees (pin, name, active, updated_at) VALUES (?, ?, ?, ?)').run('2', 'Test User 2', 1, formatLocalDateTime(new Date()));
db.prepare('INSERT INTO employees (pin, name, active, updated_at) VALUES (?, ?, ?, ?)').run('3', 'Inactive Employee', 0, formatLocalDateTime(new Date())); // Inactive employee

// Set up test dates - use separate dates for each test to avoid conflicts
const today = new Date();
today.setHours(0, 0, 0, 0);

const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

const threeDaysAgo = new Date(today);
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

const fourDaysAgo = new Date(today);
fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

const fiveDaysAgo = new Date(today);
fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

const sixDaysAgo = new Date(today);
sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const eightDaysAgo = new Date(today);
eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

// Helper to insert punch
function insertPunch(pin: string, date: Date, offsetMinutes: number = 0) {
  const punchTime = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  db.prepare(`
    INSERT INTO punches (pin, punched_at, punch_code, verify_code, source, suspect, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pin, formatLocalDateTime(punchTime), 0, 1, 'device', 0, formatLocalDateTime(new Date()));
}

// Test scenarios:

// Test 1: Normal day (two punches 8 hours apart)
console.log('Test 1: Normal day (two punches 8 hours apart)...');
insertPunch('1', threeDaysAgo, 8 * 60); // 08:00
insertPunch('1', threeDaysAgo, 16 * 60); // 16:00

// Test 2: Single punch on a past date
console.log('Test 2: Single punch on a past date...');
insertPunch('1', twoDaysAgo, 9 * 60); // 09:00

// Test 3: Single punch today
console.log('Test 3: Single punch today...');
insertPunch('1', today, 8 * 60); // 08:00

// Test 4: No punch on a weekday
console.log('Test 4: No punch on a weekday...');
// (no punches for pin 2 on fiveDaysAgo)

// Test 5: No punch on a weekend day
console.log('Test 5: No punch on a weekend day...');
// Find a weekend day in the range
const weekendDay = new Date(sevenDaysAgo);
while (weekendDay.getDay() !== 5 && weekendDay.getDay() !== 6) {
  weekendDay.setDate(weekendDay.getDate() - 1);
}
const weekendDateStr = formatDate(weekendDay);
console.log('  Using ' + weekendDateStr + ' as weekend test day (weekday: ' + weekendDay.getDay() + ')');
// No punches on this weekend day for pin 2

// Test 6: Two punches 1 minute apart (duplicate)
console.log('Test 6: Two punches 1 minute apart (duplicate)...');
insertPunch('2', fourDaysAgo, 8 * 60); // 08:00
insertPunch('2', fourDaysAgo, 8 * 60 + 1); // 08:01 (duplicate)

// Test 7: Gap over 16 hours
console.log('Test 7: Gap over 16 hours...');
insertPunch('2', sixDaysAgo, 6 * 60); // 06:00
insertPunch('2', sixDaysAgo, 23 * 60); // 23:00 (17 hours gap)

// Test 8: Unknown pin
console.log('Test 8: Unknown pin...');
insertPunch('99', yesterday, 9 * 60); // 09:00
insertPunch('99', yesterday, 17 * 60); // 17:00

// Test 9: Inactive employee with no punches in range (should not be listed)
console.log('Test 9: Inactive employee with no punches in range...');
// PIN 3 is inactive and has no punches in the range

// Test 10: Inactive employee with punches in range (should be listed)
console.log('Test 10: Inactive employee with punches in range...');
insertPunch('3', twoDaysAgo, 8 * 60); // 08:00
insertPunch('3', twoDaysAgo, 16 * 60); // 16:00

console.log();
console.log('✓ Inserted test data\n');

// Build report for range spanning several weeks
const fromDate = new Date(eightDaysAgo);
const toDate = new Date(today);

console.log('Building report from ' + formatDate(fromDate) + ' to ' + formatDate(toDate) + '...');
const { reportRows, totalsRows } = buildReport(db, fromDate, toDate, DEFAULT_CONFIG);

console.log('✓ Generated ' + reportRows.length + ' report rows');
console.log('✓ Generated ' + totalsRows.length + ' totals rows\n');

// Verify test scenarios
console.log('=== Verification ===\n');

// Test 1: Normal day
const normalDayRow = reportRows.find(r => r.pin === '1' && r.date === formatDate(threeDaysAgo));
console.log('Test 1: Normal day');
if (normalDayRow) {
  console.log('  check_in: ' + normalDayRow.check_in + ', check_out: ' + normalDayRow.check_out);
  console.log('  hours: "' + normalDayRow.hours + '", minutes: "' + normalDayRow.minutes + '"');
  console.log('  punches: ' + normalDayRow.punches);
  console.log('  note: ' + normalDayRow.note);
  const test1Pass = normalDayRow.check_in === '08:00' && normalDayRow.check_out === '16:00' && normalDayRow.hours === '8' && normalDayRow.minutes === '0' && normalDayRow.note === '';
  console.log('  Pass: ' + (test1Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 2: Single punch on past date
const singlePunchPastRow = reportRows.find(r => r.pin === '1' && r.date === formatDate(twoDaysAgo));
console.log('Test 2: Single punch on past date');
if (singlePunchPastRow) {
  console.log('  check_in: "' + singlePunchPastRow.check_in + '", check_out: "' + singlePunchPastRow.check_out + '"');
  console.log('  hours: "' + singlePunchPastRow.hours + '", minutes: "' + singlePunchPastRow.minutes + '"');
  console.log('  punches: ' + singlePunchPastRow.punches);
  console.log('  note: ' + singlePunchPastRow.note);
  const test2Pass = singlePunchPastRow.check_in === '' && singlePunchPastRow.check_out === '' && singlePunchPastRow.hours === '' && singlePunchPastRow.minutes === '' && singlePunchPastRow.note.startsWith('single punch');
  console.log('  Pass: ' + (test2Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 3: Single punch today
const singlePunchTodayRow = reportRows.find(r => r.pin === '1' && r.date === formatDate(today));
console.log('Test 3: Single punch today');
if (singlePunchTodayRow) {
  console.log('  check_in: ' + singlePunchTodayRow.check_in + ', check_out: "' + singlePunchTodayRow.check_out + '"');
  console.log('  hours: "' + singlePunchTodayRow.hours + '", minutes: "' + singlePunchTodayRow.minutes + '"');
  console.log('  punches: ' + singlePunchTodayRow.punches);
  console.log('  note: ' + singlePunchTodayRow.note);
  const test3Pass = singlePunchTodayRow.check_in === '08:00' && singlePunchTodayRow.check_out === '' && singlePunchTodayRow.hours === '' && singlePunchTodayRow.minutes === '' && singlePunchTodayRow.note === 'in progress';
  console.log('  Pass: ' + (test3Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 4: No punch on weekday
const noPunchWeekdayRow = reportRows.find(r => r.pin === '2' && r.date === formatDate(fiveDaysAgo));
console.log('Test 4: No punch on weekday');
if (noPunchWeekdayRow) {
  console.log('  punches: ' + noPunchWeekdayRow.punches);
  console.log('  hours: "' + noPunchWeekdayRow.hours + '", minutes: "' + noPunchWeekdayRow.minutes + '"');
  console.log('  note: ' + noPunchWeekdayRow.note);
  const test4Pass = noPunchWeekdayRow.punches === 0 && noPunchWeekdayRow.hours === '' && noPunchWeekdayRow.minutes === '' && noPunchWeekdayRow.note === 'no punch';
  console.log('  Pass: ' + (test4Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 5: No punch on weekend
const noPunchWeekendRow = reportRows.find(r => r.pin === '2' && r.date === weekendDateStr);
console.log('Test 5: No punch on weekend');
if (noPunchWeekendRow) {
  console.log('  punches: ' + noPunchWeekendRow.punches);
  console.log('  hours: "' + noPunchWeekendRow.hours + '", minutes: "' + noPunchWeekendRow.minutes + '"');
  console.log('  note: ' + noPunchWeekendRow.note);
  const test5Pass = noPunchWeekendRow.punches === 0 && noPunchWeekendRow.hours === '' && noPunchWeekendRow.minutes === '' && noPunchWeekendRow.note === 'weekend';
  console.log('  Pass: ' + (test5Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 6: Two punches 1 minute apart (duplicate)
const duplicateRow = reportRows.find(r => r.pin === '2' && r.date === formatDate(fourDaysAgo));
console.log('Test 6: Two punches 1 minute apart (duplicate)');
if (duplicateRow) {
  console.log('  punches: ' + duplicateRow.punches);
  console.log('  hours: "' + duplicateRow.hours + '", minutes: "' + duplicateRow.minutes + '"');
  console.log('  note: ' + duplicateRow.note);
  const test6Pass = duplicateRow.punches === 2 && duplicateRow.hours === '' && duplicateRow.minutes === '' && duplicateRow.note.startsWith('single punch');
  console.log('  Pass: ' + (test6Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 7: Gap over 16 hours
const longGapRow = reportRows.find(r => r.pin === '2' && r.date === formatDate(sixDaysAgo));
console.log('Test 7: Gap over 16 hours');
if (longGapRow) {
  console.log('  check_in: ' + longGapRow.check_in + ', check_out: ' + longGapRow.check_out);
  console.log('  hours: "' + longGapRow.hours + '", minutes: "' + longGapRow.minutes + '"');
  console.log('  note: ' + longGapRow.note);
  const test7Pass = parseInt(longGapRow.hours) > 16 && longGapRow.note === 'check manually';
  console.log('  Pass: ' + (test7Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 8: Unknown pin
const unknownPinRow = reportRows.find(r => r.pin === '99');
console.log('Test 8: Unknown pin');
if (unknownPinRow) {
  console.log('  name: ' + unknownPinRow.name);
  const test8Pass = unknownPinRow.name === 'unknown (pin 99)';
  console.log('  Pass: ' + (test8Pass ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Test 9: Inactive employee with no punches in range (should not be listed)
const inactiveNoPunchRows = reportRows.filter(r => r.pin === '3' && r.punches === 0);
console.log('Test 9: Inactive employee with no punches in range');
console.log('  Rows with PIN 3 and no punches: ' + inactiveNoPunchRows.length);
console.log('  Expected: 0 (should not be listed)');
console.log('  Pass: ' + (inactiveNoPunchRows.length === 0 ? '✓' : '✗') + '\n');

// Test 10: Inactive employee with punches in range (should be listed)
const inactiveWithPunchRows = reportRows.filter(r => r.pin === '3' && r.punches > 0);
console.log('Test 10: Inactive employee with punches in range');
if (inactiveWithPunchRows.length > 0) {
  console.log('  Rows with PIN 3 and punches: ' + inactiveWithPunchRows.length);
  console.log('  name: ' + inactiveWithPunchRows[0].name);
  console.log('  Pass: ' + (inactiveWithPunchRows[0].name === 'Inactive Employee' ? '✓' : '✗') + '\n');
} else {
  console.log('  ✗ FAIL: Row not found\n');
}

// Summary
console.log('=== Test Summary ===');
const test1Pass = normalDayRow?.check_in === '08:00' && normalDayRow?.hours === '8';
const test2Pass = singlePunchPastRow?.check_in === '' && singlePunchPastRow?.hours === '' && singlePunchPastRow?.note.startsWith('single punch');
const test3Pass = singlePunchTodayRow?.check_in === '08:00' && singlePunchTodayRow?.hours === '' && singlePunchTodayRow?.note === 'in progress';
const test4Pass = noPunchWeekdayRow?.punches === 0 && noPunchWeekdayRow?.hours === '' && noPunchWeekdayRow?.note === 'no punch';
const test5Pass = noPunchWeekendRow?.punches === 0 && noPunchWeekendRow?.hours === '' && noPunchWeekendRow?.note === 'weekend';
const test6Pass = duplicateRow?.punches === 2 && duplicateRow?.hours === '' && duplicateRow?.note.startsWith('single punch');
const test7Pass = parseInt(longGapRow?.hours || '0') > 16 && longGapRow?.note === 'check manually';
const test8Pass = unknownPinRow?.name === 'unknown (pin 99)';
const test9Pass = inactiveNoPunchRows.length === 0;
const test10Pass = inactiveWithPunchRows.length > 0 && inactiveWithPunchRows[0].name === 'Inactive Employee';

const allPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass && test6Pass && test7Pass && test8Pass && test9Pass && test10Pass;

if (allPassed) {
  console.log('✓ ALL TESTS PASSED');
  db.close();
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  console.log('  Test 1 (normal day): ' + (test1Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 2 (single punch past): ' + (test2Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 3 (single punch today): ' + (test3Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 4 (no punch weekday): ' + (test4Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 5 (no punch weekend): ' + (test5Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 6 (duplicate): ' + (test6Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 7 (long gap): ' + (test7Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 8 (unknown pin): ' + (test8Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 9 (inactive no punches): ' + (test9Pass ? 'PASS' : 'FAIL'));
  console.log('  Test 10 (inactive with punches): ' + (test10Pass ? 'PASS' : 'FAIL'));
  db.close();
  process.exit(1);
}
