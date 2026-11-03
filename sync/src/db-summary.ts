/**
 * Print database summary statistics.
 */

import { getDatabase, getSummary } from './db.js';

console.log('=== Database Summary ===\n');

const db = getDatabase();
const summary = getSummary(db);

console.log(`Employees: ${summary.employeesCount}`);
console.log(`Punches: ${summary.punchesCount}`);
console.log(`Suspect punches: ${summary.suspectCount}`);
console.log(`Earliest punch: ${summary.earliestPunch || 'N/A'}`);
console.log(`Latest punch: ${summary.latestPunch || 'N/A'}`);
console.log(`Distinct pins in punches not in employees: ${summary.distinctPinsNotInEmployees}`);
console.log();
console.log('Punches by year-month:');
for (const row of summary.punchesByYearMonth) {
  console.log(`  ${row.yearMonth}: ${row.count}`);
}

db.close();
