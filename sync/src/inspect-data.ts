/**
 * Inspect attendance data from the database.
 * Part A: Inspect the data (numbers only).
 */

import { getDatabase } from './db.js';

const db = getDatabase();

// Helper: get punch statistics for a pin
function getPinStats(pin: string, daysAgo: number = 90) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_punches,
      MIN(punched_at) as first_punch,
      MAX(punched_at) as last_punch
    FROM punches
    WHERE pin = ?
  `).get(pin) as { total_punches: number; first_punch: string | null; last_punch: string | null };

  const recentStats = db.prepare(`
    SELECT COUNT(*) as recent_punches
    FROM punches
    WHERE pin = ? AND date(punched_at) >= date('now', '-' || ? || ' days')
  `).get(pin, daysAgo) as { recent_punches: number };

  const distinctDays = db.prepare(`
    SELECT COUNT(DISTINCT date(punched_at)) as distinct_days
    FROM punches
    WHERE pin = ?
  `).get(pin) as { distinct_days: number };

  return {
    totalPunches: stats.total_punches,
    firstPunch: stats.first_punch,
    lastPunch: stats.last_punch,
    recentPunches: recentStats.recent_punches,
    distinctDays: distinctDays.distinct_days,
  };
}

// Helper: get punches per weekday
function getWeekdayCounts(daysAgo?: number) {
  let query = `
    SELECT
      strftime('%w', punched_at) as weekday,
      COUNT(*) as count
    FROM punches
  `;
  const params: any[] = [];

  if (daysAgo !== undefined) {
    query += ` WHERE date(punched_at) >= date('now', '-' || ? || ' days')`;
    params.push(daysAgo);
  }

  query += ` GROUP BY weekday ORDER BY weekday`;

  const rows = db.prepare(query).all(...params) as Array<{ weekday: string; count: number }>;

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const result: { weekday: string; count: number }[] = [];

  for (let i = 0; i < 7; i++) {
    const row = rows.find(r => parseInt(r.weekday) === i);
    result.push({
      weekday: weekdayNames[i],
      count: row ? row.count : 0,
    });
  }

  return result;
}

console.log('=== Part A: Data Inspection ===\n');

// Part A.1: Unknown pins (10, 11, 15, 16)
console.log('A.1: Unknown pins (in punches but not in employees)');
const unknownPins = ['10', '11', '15', '16'];
for (const pin of unknownPins) {
  const stats = getPinStats(pin);
  console.log(`  PIN ${pin}:`);
  console.log(`    Total punches: ${stats.totalPunches}`);
  console.log(`    First punch: ${stats.firstPunch || 'N/A'}`);
  console.log(`    Last punch: ${stats.lastPunch || 'N/A'}`);
  console.log(`    Punches in last 90 days: ${stats.recentPunches}`);
  console.log(`    Distinct days with punches: ${stats.distinctDays}`);
}
console.log();

// Part A.2: Known employees
console.log('A.2: Known employees (12 pins)');
const knownPins = db.prepare('SELECT pin FROM employees ORDER BY pin').all() as Array<{ pin: string }>;
for (const row of knownPins) {
  const stats = getPinStats(row.pin);
  console.log(`  PIN ${row.pin}:`);
  console.log(`    Total punches: ${stats.totalPunches}`);
  console.log(`    First punch: ${stats.firstPunch || 'N/A'}`);
  console.log(`    Last punch: ${stats.lastPunch || 'N/A'}`);
  console.log(`    Punches in last 90 days: ${stats.recentPunches}`);
  console.log(`    Distinct days with punches: ${stats.distinctDays}`);
}
console.log();

// Part A.3: Punches per weekday
console.log('A.3: Punches per weekday (whole history)');
const weekdayCounts = getWeekdayCounts();
for (const row of weekdayCounts) {
  console.log(`  ${row.weekday}: ${row.count}`);
}
console.log();

console.log('A.3: Punches per weekday (last 90 days)');
const recentWeekdayCounts = getWeekdayCounts(90);
for (const row of recentWeekdayCounts) {
  console.log(`  ${row.weekday}: ${row.count}`);
}

db.close();
