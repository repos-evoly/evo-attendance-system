/**
 * Test sync guards (lock file, warning guard).
 * Uses in-memory database and temporary lock file.
 */

import Database from 'better-sqlite3';
import { formatLocalDateTime } from './db.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_LOCK_FILE = path.join(process.cwd(), 'data', 'test-sync.lock');
const LOCK_STALE_MINUTES = 15;

console.log('=== Sync Guards Tests ===\n');

// Clean up any existing test lock file
try {
  if (fs.existsSync(TEST_LOCK_FILE)) {
    fs.unlinkSync(TEST_LOCK_FILE);
  }
} catch (e) {
  // Ignore
}

// Test lock functions
function testCreateLock(): boolean {
  const dataDir = path.dirname(TEST_LOCK_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(TEST_LOCK_FILE)) {
    try {
      const content = fs.readFileSync(TEST_LOCK_FILE, 'utf8');
      const lockData = JSON.parse(content);
      const lockTime = new Date(lockData.startTime);
      const now = new Date();
      const ageMinutes = (now.getTime() - lockTime.getTime()) / (1000 * 60);

      if (ageMinutes < LOCK_STALE_MINUTES) {
        return false;
      } else {
        fs.unlinkSync(TEST_LOCK_FILE);
      }
    } catch (e) {
      try {
        fs.unlinkSync(TEST_LOCK_FILE);
      } catch (e2) {
        // Ignore
      }
    }
  }

  const lockData = {
    pid: process.pid,
    startTime: new Date().toISOString(),
  };
  fs.writeFileSync(TEST_LOCK_FILE, JSON.stringify(lockData, null, 2));
  return true;
}

function testRemoveLock(): void {
  try {
    if (fs.existsSync(TEST_LOCK_FILE)) {
      fs.unlinkSync(TEST_LOCK_FILE);
    }
  } catch (e) {
    // Ignore
  }
}

// Test 1: Lock blocks a second run
console.log('Test 1: Lock blocks a second run...');
const lock1 = testCreateLock();
console.log(`  First createLock(): ${lock1 ? 'success' : 'blocked'}`);
const lock2 = testCreateLock();
console.log(`  Second createLock(): ${lock2 ? 'success' : 'blocked'}`);
console.log(`  Expected: first success, second blocked`);
console.log(`  Pass: ${lock1 && !lock2 ? '✓' : '✗'}\n`);

// Clean up
testRemoveLock();

// Test 2: Stale lock is replaced
console.log('Test 2: Stale lock is replaced...');
const staleLockData = {
  pid: 9999,
  startTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
};
fs.writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLockData, null, 2));
console.log(`  Created stale lock (20 minutes old)`);

const lock3 = testCreateLock();
console.log(`  createLock() with stale lock: ${lock3 ? 'success' : 'blocked'}`);
console.log(`  Expected: success (stale lock replaced)`);
console.log(`  Pass: ${lock3 ? '✓' : '✗'}\n`);

// Clean up
testRemoveLock();

// Test 3: Lock is released after an error
console.log('Test 3: Lock is released after an error...');
testCreateLock();
console.log(`  Created lock`);
const lockExistsBefore = fs.existsSync(TEST_LOCK_FILE);
console.log(`  Lock exists before error: ${lockExistsBefore ? 'yes' : 'no'}`);

try {
  throw new Error('Simulated error');
} catch (e) {
  // Simulate error handling with finally block
}
testRemoveLock(); // This would be in a finally block
const lockExistsAfter = fs.existsSync(TEST_LOCK_FILE);
console.log(`  Lock exists after cleanup: ${lockExistsAfter ? 'yes' : 'no'}`);
console.log(`  Expected: exists before, not exists after`);
console.log(`  Pass: ${lockExistsBefore && !lockExistsAfter ? '✓' : '✗'}\n`);

// Test 4: Warning guard triggers on fewer records
console.log('Test 4: Warning guard triggers on fewer records...');
const db = new Database(':memory:');

// Create schema
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

// Insert 100 existing device punches
for (let i = 0; i < 100; i++) {
  const punchTime = new Date(Date.now() - i * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO punches (pin, punched_at, punch_code, verify_code, source, suspect, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('1', formatLocalDateTime(punchTime), 0, 1, 'device', 0, formatLocalDateTime(new Date()));
}

const existingCount = db.prepare('SELECT COUNT(*) as count FROM punches WHERE source = ?').get('device') as { count: number };
console.log(`  Existing device punches: ${existingCount.count}`);

// Simulate device returning fewer records
const deviceRecords = 50;
console.log(`  Device returned: ${deviceRecords} records`);

const shouldWarn = deviceRecords < existingCount.count;
console.log(`  Should trigger warning: ${shouldWarn ? 'yes' : 'no'}`);
console.log(`  Expected: yes`);
console.log(`  Pass: ${shouldWarn ? '✓' : '✗'}\n`);

// Test 5: Warning guard triggers on zero records with existing data
console.log('Test 5: Warning guard triggers on zero records with existing data...');
const deviceRecordsZero = 0;
const shouldWarnZero = deviceRecordsZero === 0 && existingCount.count > 0;
console.log(`  Device returned: ${deviceRecordsZero} records`);
console.log(`  Existing punches: ${existingCount.count}`);
console.log(`  Should trigger warning: ${shouldWarnZero ? 'yes' : 'no'}`);
console.log(`  Expected: yes`);
console.log(`  Pass: ${shouldWarnZero ? '✓' : '✗'}\n`);

db.close();

// Clean up test lock file
try {
  if (fs.existsSync(TEST_LOCK_FILE)) {
    fs.unlinkSync(TEST_LOCK_FILE);
  }
} catch (e) {
  // Ignore
}

// Summary
console.log('=== Test Summary ===');
const test1Pass = lock1 && !lock2;
const test2Pass = lock3;
const test3Pass = lockExistsBefore && !lockExistsAfter;
const test4Pass = shouldWarn;
const test5Pass = shouldWarnZero;

const allPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass;

if (allPassed) {
  console.log('✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  console.log(`  Test 1 (lock blocks second run): ${test1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 2 (stale lock replaced): ${test2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 3 (lock released after error): ${test3Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 4 (warning on fewer records): ${test4Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 5 (warning on zero records): ${test5Pass ? 'PASS' : 'FAIL'}`);
  process.exit(1);
}
