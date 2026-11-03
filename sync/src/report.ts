/**
 * Weekly attendance report from the database.
 * CLI: npm run report -- --from 2026-10-26 --to 2026-11-01
 */

import Database from 'better-sqlite3';
import { getDatabase } from './db.js';
import { DEFAULT_CONFIG, ReportConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'out');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time as HH:mm
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format hours and minutes as HH:mm
 */
function formatHHMM(hours: number, minutes: number): string {
  return `${Math.floor(hours)}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Get weekday name
 */
function getWeekday(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Check if two dates are the same day
 */
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Check if a date is today
 */
function isToday(date: Date): boolean {
  const today = new Date();
  return isSameDay(date, today);
}

/**
 * Write CSV with UTF-8 BOM for Arabic support in Excel
 */
function writeCSVWithBOM(filePath: string, content: string): void {
  const BOM = '\uFEFF';
  fs.writeFileSync(filePath, BOM + content, 'utf8');
}

/**
 * Build report for a date range.
 */
export function buildReport(
  db: Database.Database,
  fromDate: Date,
  toDate: Date,
  config: ReportConfig = DEFAULT_CONFIG,
): {
  reportRows: Array<{
    pin: string;
    name: string;
    date: string;
    weekday: string;
    check_in: string;
    check_out: string;
    punches: number;
    hours: string;
    minutes: string;
    total_hhmm: string;
    note: string;
  }>;
  totalsRows: Array<{
    pin: string;
    name: string;
    days_with_punches: number;
    complete_days: number;
    single_punch_days: number;
    total_hours: number;
    total_minutes: number;
    total_hhmm: string;
  }>;
} {
  const reportRows: Array<{
    pin: string;
    name: string;
    date: string;
    weekday: string;
    check_in: string;
    check_out: string;
    punches: number;
    hours: string;
    minutes: string;
    total_hhmm: string;
    note: string;
  }> = [];

  // Get all active employees
  const employees = db.prepare('SELECT pin, name FROM employees WHERE active = 1 ORDER BY pin').all() as Array<{ pin: string; name: string }>;

  // Get all pins that have punches in the range (including unknown pins)
  const pinsInRange = db.prepare(`
    SELECT DISTINCT pin
    FROM punches
    WHERE date(punched_at) >= ? AND date(punched_at) <= ?
    ORDER BY pin
  `).all(formatDate(fromDate), formatDate(toDate)) as Array<{ pin: string }>;

  // Get all inactive employees
  const inactiveEmployees = db.prepare('SELECT pin, name FROM employees WHERE active = 0 ORDER BY pin').all() as Array<{ pin: string; name: string }>;

  // Combine: all active employees + inactive employees with punches in range + unknown pins with punches in range
  const allPins = new Set<string>();
  for (const emp of employees) {
    allPins.add(emp.pin);
  }
  for (const emp of inactiveEmployees) {
    // Only add inactive employee if they have punches in range
    const hasPunchesInRange = pinsInRange.some(p => p.pin === emp.pin);
    if (hasPunchesInRange) {
      allPins.add(emp.pin);
    }
  }
  for (const row of pinsInRange) {
    // Add unknown pins (not in employees table) if they have punches in range
    const isKnownEmployee = employees.some(e => e.pin === row.pin) || inactiveEmployees.some(e => e.pin === row.pin);
    if (!isKnownEmployee) {
      allPins.add(row.pin);
    }
  }

  // Get all dates in the range
  const dates: Date[] = [];
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Generate rows
  for (const pin of Array.from(allPins).sort((a, b) => parseInt(a) - parseInt(b))) {
    const employee = employees.find(e => e.pin === pin);
    const inactiveEmployee = inactiveEmployees.find(e => e.pin === pin);
    const name = employee ? employee.name : (inactiveEmployee ? inactiveEmployee.name : `unknown (pin ${pin})`);

    // For active employees, generate rows for all dates in range
    // For inactive employees and unknown pins, only generate rows for dates where they have punches
    const datesToProcess = employee ? dates : dates.filter(day => {
      const dateStr = formatDate(day);
      const punchCount = db.prepare('SELECT COUNT(*) as count FROM punches WHERE pin = ? AND date(punched_at) = ?').get(pin, dateStr) as { count: number };
      return punchCount.count > 0;
    });

    for (const day of datesToProcess) {
      const dateStr = formatDate(day);
      const weekday = getWeekday(day);
      const weekdayNum = day.getDay();

      // Get all punches for this user on this day
      const dayPunches = db.prepare(`
        SELECT punched_at
        FROM punches
        WHERE pin = ? AND date(punched_at) = ?
        ORDER BY punched_at
      `).all(pin, dateStr) as Array<{ punched_at: string }>;

      const punchTimes = dayPunches.map(p => new Date(p.punched_at));
      const totalPunches = punchTimes.length;

      // Check if it's a weekend
      const isWeekend = config.weekendDays.includes(weekdayNum);

      if (totalPunches === 0) {
        // No punches
        const note = isWeekend ? 'weekend' : 'no punch';
        reportRows.push({
          pin,
          name,
          date: dateStr,
          weekday,
          check_in: '',
          check_out: '',
          punches: 0,
          hours: '',
          minutes: '',
          total_hhmm: '',
          note,
        });
      } else if (totalPunches === 1) {
        // One punch only
        const punchTime = punchTimes[0];
        const dayIsToday = isToday(day);

        if (dayIsToday) {
          // Today with 1 punch: in progress
          reportRows.push({
            pin,
            name,
            date: dateStr,
            weekday,
            check_in: formatTime(punchTime),
            check_out: '',
            punches: 1,
            hours: '',
            minutes: '',
            total_hhmm: '',
            note: 'in progress',
          });
        } else {
          // Past date with 1 punch: single punch
          reportRows.push({
            pin,
            name,
            date: dateStr,
            weekday,
            check_in: '',
            check_out: '',
            punches: 1,
            hours: '',
            minutes: '',
            total_hhmm: '',
            note: `single punch ${formatTime(punchTime)}`,
          });
        }
      } else {
        // Multiple punches - remove duplicates
        const uniquePunches: Date[] = [punchTimes[0]];
        for (let i = 1; i < punchTimes.length; i++) {
          const prev = uniquePunches[uniquePunches.length - 1];
          const current = punchTimes[i];
          const diffMs = current.getTime() - prev.getTime();
          if (diffMs >= config.duplicatePunchMinutes * 60 * 1000) {
            uniquePunches.push(current);
          }
        }

        // Check if we have at least 2 distinct punches
        if (uniquePunches.length < 2) {
          // Fewer than 2 distinct punches (even though totalPunches >= 2)
          const punchTime = uniquePunches[0];
          const dayIsToday = isToday(day);

          if (dayIsToday) {
            reportRows.push({
              pin,
              name,
              date: dateStr,
              weekday,
              check_in: formatTime(punchTime),
              check_out: '',
              punches: totalPunches,
              hours: '',
              minutes: '',
              total_hhmm: '',
              note: 'in progress',
            });
          } else {
            reportRows.push({
              pin,
              name,
              date: dateStr,
              weekday,
              check_in: '',
              check_out: '',
              punches: totalPunches,
              hours: '',
              minutes: '',
              total_hhmm: '',
              note: `single punch ${formatTime(punchTime)}`,
            });
          }
        } else {
          // At least 2 distinct punches - calculate hours
          const checkIn = uniquePunches[0];
          const checkOut = uniquePunches[uniquePunches.length - 1];
          const diffMs = checkOut.getTime() - checkIn.getTime();
          const hoursVal = Math.floor(diffMs / (60 * 60 * 1000));
          const minutesVal = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));

          let note = '';
          if (isToday(day)) {
            note = 'today';
          }
          if (diffMs > config.maxShiftHours * 60 * 60 * 1000) {
            note = note ? `${note}, check manually` : 'check manually';
          }

          reportRows.push({
            pin,
            name,
            date: dateStr,
            weekday,
            check_in: formatTime(checkIn),
            check_out: formatTime(checkOut),
            punches: totalPunches,
            hours: hoursVal.toString(),
            minutes: minutesVal.toString(),
            total_hhmm: formatHHMM(hoursVal, minutesVal),
            note,
          });
        }
      }
    }
  }

  // Generate totals
  const totalsRows: Array<{
    pin: string;
    name: string;
    days_with_punches: number;
    complete_days: number;
    single_punch_days: number;
    total_hours: number;
    total_minutes: number;
    total_hhmm: string;
  }> = [];

  for (const pin of Array.from(allPins).sort((a, b) => parseInt(a) - parseInt(b))) {
    const employee = employees.find(e => e.pin === pin);
    const inactiveEmployee = inactiveEmployees.find(e => e.pin === pin);
    const name = employee ? employee.name : (inactiveEmployee ? inactiveEmployee.name : `unknown (pin ${pin})`);

    const userRows = reportRows.filter(r => r.pin === pin);

    const daysWithPunches = userRows.filter(r => r.punches > 0).length;
    const completeDays = userRows.filter(r => r.punches >= 2).length;
    const singlePunchDays = userRows.filter(r => r.punches === 1 && !isToday(new Date(r.date))).length;

    let totalMinutes = 0;
    for (const row of userRows) {
      // Only add hours/minutes for complete days (non-empty values)
      if (row.hours !== '' && row.minutes !== '') {
        totalMinutes += parseInt(row.hours) * 60 + parseInt(row.minutes);
      }
    }

    const total_hours = Math.floor(totalMinutes / 60);
    const total_minutes = totalMinutes % 60;

    totalsRows.push({
      pin,
      name,
      days_with_punches: daysWithPunches,
      complete_days: completeDays,
      single_punch_days: singlePunchDays,
      total_hours,
      total_minutes,
      total_hhmm: formatHHMM(total_hours, total_minutes),
    });
  }

  return { reportRows, totalsRows };
}

/**
 * CLI entry point.
 */
export function runReportCLI(args: string[]): void {
  const fromArgIndex = args.indexOf('--from');
  const toArgIndex = args.indexOf('--to');

  if (fromArgIndex === -1 || toArgIndex === -1 || fromArgIndex + 1 >= args.length || toArgIndex + 1 >= args.length) {
    console.error('Usage: npm run report -- --from YYYY-MM-DD --to YYYY-MM-DD');
    process.exit(1);
  }

  const fromDateStr = args[fromArgIndex + 1];
  const toDateStr = args[toArgIndex + 1];

  const fromDate = new Date(fromDateStr);
  const toDate = new Date(toDateStr);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    console.error('Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }

  console.log(`=== Building Report ===`);
  console.log(`From: ${fromDateStr}`);
  console.log(`To: ${toDateStr}`);
  console.log();

  const db = getDatabase();
  const { reportRows, totalsRows } = buildReport(db, fromDate, toDate);

  // Write report CSV
  const reportCSVPath = path.join(OUTPUT_DIR, `report_${fromDateStr}_${toDateStr}.csv`);
  const reportHeader = 'pin,name,date,weekday,check_in,check_out,punches,hours,minutes,total_hhmm,note\n';
  const reportCSVRows = reportRows.map(r =>
    `${r.pin},"${r.name.replace(/"/g, '""')}",${r.date},${r.weekday},"${r.check_in}","${r.check_out}",${r.punches},"${r.hours}","${r.minutes}","${r.total_hhmm}","${r.note}"`
  ).join('\n');
  writeCSVWithBOM(reportCSVPath, reportHeader + reportCSVRows);
  console.log(`✓ Wrote report to ${reportCSVPath}`);

  // Write totals CSV
  const totalsCSVPath = path.join(OUTPUT_DIR, `totals_${fromDateStr}_${toDateStr}.csv`);
  const totalsHeader = 'pin,name,days_with_punches,complete_days,single_punch_days,total_hours,total_minutes,total_hhmm\n';
  const totalsCSVRows = totalsRows.map(r =>
    `${r.pin},"${r.name.replace(/"/g, '""')}",${r.days_with_punches},${r.complete_days},${r.single_punch_days},${r.total_hours},${r.total_minutes},"${r.total_hhmm}"`
  ).join('\n');
  writeCSVWithBOM(totalsCSVPath, totalsHeader + totalsCSVRows);
  console.log(`✓ Wrote totals to ${totalsCSVPath}`);

  db.close();
}



