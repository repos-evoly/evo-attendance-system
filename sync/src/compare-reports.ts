/**
 * Compare new report with old Stage 4 weekly_report.csv
 * Only compare dates before today and rows with 2+ punches.
 */

import * as fs from 'fs';
import * as path from 'path';

const NEW_REPORT_PATH = path.join(process.cwd(), 'out', 'report_2026-10-26_2026-11-01.csv');
const OLD_REPORT_PATH = path.join(process.cwd(), 'out', 'weekly_report.csv');

console.log('=== Report Comparison ===\n');

if (!fs.existsSync(OLD_REPORT_PATH)) {
  console.log('Old report (weekly_report.csv) not found. Skipping comparison.');
  process.exit(0);
}

// Read reports
const newContent = fs.readFileSync(NEW_REPORT_PATH, 'utf8');
const oldContent = fs.readFileSync(OLD_REPORT_PATH, 'utf8');

// Parse CSV (skip BOM and header)
const newLines = newContent.replace(/^\uFEFF/, '').split('\n').filter(line => line.trim());
const oldLines = oldContent.replace(/^\uFEFF/, '').split('\n').filter(line => line.trim());

const newRows = newLines.slice(1).map(line => {
  const parts = line.split(',');
  return {
    pin: parts[0],
    date: parts[2],
    check_in: parts[4].replace(/"/g, ''),
    check_out: parts[5].replace(/"/g, ''),
    hours: parseInt(parts[7]),
    punches: parseInt(parts[6]),
  };
});

const oldRows = oldLines.slice(1).map(line => {
  const parts = line.split(',');
  return {
    pin: parts[0],
    date: parts[2],
    check_in: parts[4].replace(/"/g, ''),
    check_out: parts[5].replace(/"/g, ''),
    hours: parseInt(parts[7]),
    punches: parseInt(parts[6]),
  };
});

// Today's date
const today = new Date();
const todayStr = today.toISOString().split('T')[0];

// Filter: dates before today and rows with 2+ punches
const newFiltered = newRows.filter(r => r.date < todayStr && r.punches >= 2);
const oldFiltered = oldRows.filter(r => r.date < todayStr && r.punches >= 2);

console.log('New report (filtered): ' + newFiltered.length + ' rows');
console.log('Old report (filtered): ' + oldFiltered.length + ' rows\n');

// Compare
let differences: Array<{ pin: string; date: string; field: string; old: string; new: string }> = [];

for (const newRow of newFiltered) {
  const oldRow = oldRows.find(r => r.pin === newRow.pin && r.date === newRow.date);
  if (!oldRow) {
    continue; // Skip if not in old report
  }

  if (newRow.check_in !== oldRow.check_in) {
    differences.push({ pin: newRow.pin, date: newRow.date, field: 'check_in', old: oldRow.check_in, new: newRow.check_in });
  }
  if (newRow.check_out !== oldRow.check_out) {
    differences.push({ pin: newRow.pin, date: newRow.date, field: 'check_out', old: oldRow.check_out, new: newRow.check_out });
  }
  if (newRow.hours !== oldRow.hours) {
    differences.push({ pin: newRow.pin, date: newRow.date, field: 'hours', old: String(oldRow.hours), new: String(newRow.hours) });
  }
}

console.log('Differences found: ' + differences.length);
if (differences.length > 0) {
  console.log();
  for (const diff of differences) {
    console.log('  PIN ' + diff.pin + ', Date ' + diff.date + ', ' + diff.field + ': "' + diff.old + '" -> "' + diff.new + '"');
  }
} else {
  console.log('✓ No differences in check_in, check_out, or hours for filtered rows\n');
}

// Count note values in new report
const noteCounts = new Map<string, number>();
for (const line of newLines.slice(1)) {
  const parts = line.split(',');
  const note = parts[parts.length - 1].replace(/"/g, '');
  noteCounts.set(note, (noteCounts.get(note) || 0) + 1);
}

console.log('\n=== Note Counts in New Report ===');
for (const [note, count] of Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1])) {
  console.log('  "' + note + '": ' + count);
}
