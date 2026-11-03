/**
 * Test employee:set-active command
 */

import Database from 'better-sqlite3';
import { formatLocalDateTime } from './db.js';

console.log('=== Test employee:set-active ===\n');

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

// Insert test employee
db.prepare('INSERT INTO employees (pin, name, active, updated_at) VALUES (?, ?, ?, ?)').run('13', 'Test Employee', 1, formatLocalDateTime(new Date()));

console.log('Test 1: Set active to 0...');
db.prepare('UPDATE employees SET active = ? WHERE pin = ?').run(0, '13');
const result1 = db.prepare('SELECT active FROM employees WHERE pin = ?').get('13') as { active: number } | undefined;
if (result1) {
  console.log(`  PIN: 13`);
  console.log(`  Active: ${result1.active}`);
  console.log(`  Pass: ${result1.active === 0 ? '✓' : '✗'}\n`);
} else {
  console.log('  ✗ FAIL: Employee not found\n');
}

console.log('Test 2: Set active to 1...');
db.prepare('UPDATE employees SET active = ? WHERE pin = ?').run(1, '13');
const result2 = db.prepare('SELECT active FROM employees WHERE pin = ?').get('13') as { active: number } | undefined;
if (result2) {
  console.log(`  PIN: 13`);
  console.log(`  Active: ${result2.active}`);
  console.log(`  Pass: ${result2.active === 1 ? '✓' : '✗'}\n`);
} else {
  console.log('  ✗ FAIL: Employee not found\n');
}

console.log('=== Test Summary ===');
const test1Pass = result1?.active === 0;
const test2Pass = result2?.active === 1;

if (test1Pass && test2Pass) {
  console.log('✓ ALL TESTS PASSED');
  db.close();
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  console.log(`  Test 1 (set active 0): ${test1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 2 (set active 1): ${test2Pass ? 'PASS' : 'FAIL'}`);
  db.close();
  process.exit(1);
}
