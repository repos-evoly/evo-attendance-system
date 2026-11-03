/**
 * Database module for attendance data.
 * Uses better-sqlite3 with SQLite.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'attendance.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Constants for suspect records
const SUSPECT_FUTURE_DAYS = 1; // Record after now + 1 day is suspect
const SUSPECT_BEFORE_YEAR = 2020; // Record before 2020-01-01 is suspect

/**
 * Get the database instance.
 * Creates the database file and schema if it doesn't exist.
 */
export function getDatabase(): Database.Database {
  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables if they don't exist
  createSchema(db);

  return db;
}

/**
 * Create the database schema.
 */
function createSchema(db: Database.Database): void {
  // Employees table
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      pin TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      updated_at TEXT
    )
  `);

  // Punches table
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

  // Sync runs table
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

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_punches_pin ON punches(pin);
    CREATE INDEX IF NOT EXISTS idx_punches_punched_at ON punches(punched_at);
    CREATE INDEX IF NOT EXISTS idx_punches_suspect ON punches(suspect);
    CREATE INDEX IF NOT EXISTS idx_punches_imported_at ON punches(imported_at);
  `);
}

/**
 * Format a Date as local wall-clock time 'YYYY-MM-DD HH:mm:ss'.
 * Uses LOCAL getters, NOT toISOString.
 */
export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Check if a punch date is suspect (future or too old).
 */
export function isSuspectDate(punchDate: Date): boolean {
  const now = new Date();
  const futureLimit = new Date(now.getTime() + SUSPECT_FUTURE_DAYS * 24 * 60 * 60 * 1000);
  const oldLimit = new Date(`${SUSPECT_BEFORE_YEAR}-01-01T00:00:00`);

  return punchDate > futureLimit || punchDate < oldLimit;
}

/**
 * Upsert an employee record.
 * Updates only name and updated_at; never changes active column.
 * New employees default to active = 1.
 */
export function upsertEmployee(db: Database.Database, pin: string, name: string): void {
  const stmt = db.prepare(`
    INSERT INTO employees (pin, name, active, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(pin) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
      -- active column is NOT updated on conflict
  `);
  stmt.run(pin, name, formatLocalDateTime(new Date()));
}

/**
 * Insert a punch record.
 * Returns true if the record was inserted (new), false if it already existed.
 */
export function insertPunch(
  db: Database.Database,
  pin: string,
  punchedAt: Date,
  punchCode: number,
  verifyCode: number,
  source: string = 'device',
): boolean {
  const suspect = isSuspectDate(punchedAt) ? 1 : 0;
  const punchedAtStr = formatLocalDateTime(punchedAt);
  const importedAt = formatLocalDateTime(new Date());

  const stmt = db.prepare(`
    INSERT INTO punches (pin, punched_at, punch_code, verify_code, source, suspect, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pin, punched_at) DO NOTHING
  `);

  const result = stmt.run(pin, punchedAtStr, punchCode, verifyCode, source, suspect, importedAt);
  return result.changes > 0;
}

/**
 * Insert a sync run record with status 'running'.
 */
export function insertSyncRun(db: Database.Database): number {
  const stmt = db.prepare(`
    INSERT INTO sync_runs (started_at, status)
    VALUES (?, 'running')
  `);
  const result = stmt.run(formatLocalDateTime(new Date()));
  return result.lastInsertRowid as number;
}

/**
 * Update a sync run record with final status and counts.
 */
export function updateSyncRun(
  db: Database.Database,
  id: number,
  status: 'ok' | 'failed' | 'ok_with_warning',
  usersSeen: number,
  recordsSeen: number,
  recordsNew: number,
  suspectNew: number,
  error?: string,
): void {
  const stmt = db.prepare(`
    UPDATE sync_runs
    SET finished_at = ?,
        status = ?,
        users_seen = ?,
        records_seen = ?,
        records_new = ?,
        suspect_new = ?,
        error = ?
    WHERE id = ?
  `);
  stmt.run(formatLocalDateTime(new Date()), status, usersSeen, recordsSeen, recordsNew, suspectNew, error || null, id);
}

/**
 * Get database summary statistics.
 */
export function getSummary(db: Database.Database): {
  employeesCount: number;
  punchesCount: number;
  suspectCount: number;
  earliestPunch: string | null;
  latestPunch: string | null;
  distinctPinsNotInEmployees: number;
  punchesByYearMonth: Array<{ yearMonth: string; count: number }>;
} {
  const employeesCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
  const punchesCount = db.prepare('SELECT COUNT(*) as count FROM punches').get() as { count: number };
  const suspectCount = db.prepare('SELECT COUNT(*) as count FROM punches WHERE suspect = 1').get() as { count: number };

  const earliestPunch = db.prepare('SELECT MIN(punched_at) as min FROM punches').get() as { min: string | null };
  const latestPunch = db.prepare('SELECT MAX(punched_at) as max FROM punches').get() as { max: string | null };

  const distinctPinsNotInEmployees = db.prepare(`
    SELECT COUNT(DISTINCT p.pin) as count
    FROM punches p
    LEFT JOIN employees e ON p.pin = e.pin
    WHERE e.pin IS NULL
  `).get() as { count: number };

  const punchesByYearMonth = db.prepare(`
    SELECT
      strftime('%Y-%m', punched_at) as year_month,
      COUNT(*) as count
    FROM punches
    GROUP BY year_month
    ORDER BY year_month
  `).all() as Array<{ year_month: string; count: number }>;

  return {
    employeesCount: employeesCount.count,
    punchesCount: punchesCount.count,
    suspectCount: suspectCount.count,
    earliestPunch: earliestPunch.min,
    latestPunch: latestPunch.max,
    distinctPinsNotInEmployees: distinctPinsNotInEmployees.count,
    punchesByYearMonth: punchesByYearMonth.map(r => ({ yearMonth: r.year_month, count: r.count })),
  };
}
