/**
 * STAGE 4: WEEKLY ATTENDANCE REPORT FROM THE REAL DEVICE (READ-ONLY).
 *
 * Safety rules:
 * - Connect ONCE to 10.1.201.89:4370 using createSafeZKClientWithAllowlist (allowlist active, fail closed).
 * - Allowed calls ONLY: connect(), getInfo(), getAttendances(), disconnect().
 * - Do NOT call getUsers(), getTime(), or anything else. Take names from the existing out/users_device.csv.
 * - Log every command ID sent. If any ID outside the allowlist appears, or the allowlist blocks anything, abort immediately.
 * - No retries. On any error or hang (over 60 seconds), disconnect and stop.
 * - Do NOT write to the device in any way.
 */

import { createSafeZKClient } from './safeClient.js';
import { getCommandCounts, getBlockedCommands, resetCommandCounts, resetBlockedCommands } from './allowlistTransport.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DEVICE_IP = '10.1.201.89';
const DEVICE_PORT = 4370;
const TIMEOUT_MS = 60000; // 60 seconds max for entire operation
const OUTPUT_DIR = path.join(process.cwd(), 'out');

// Allowed command IDs for this stage (no CMD_GET_TIME)
const ALLOWED_COMMAND_IDS = new Set<number>([
  1000, // CMD_CONNECT
  1102, // CMD_AUTH
  50,   // CMD_GET_FREE_SIZES
  1502, // CMD_FREE_DATA
  1503, // CMD_DATA_WRRQ
  1504, // CMD_DATA_RDY
  1001, // CMD_EXIT
]);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load users from out/users_device.csv (UTF-8 with BOM)
function loadUsers(): Map<string, string> {
  const filePath = path.join(OUTPUT_DIR, 'users_device.csv');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // Skip BOM and header
  const dataLines = lines.slice(1);
  const users = new Map<string, string>();
  
  for (const line of dataLines) {
    const match = line.match(/^(\d+),"([^"]*)"/);
    if (match) {
      const pin = match[1];
      const name = match[2];
      users.set(pin, name);
    }
  }
  
  return users;
}

// Write CSV with UTF-8 BOM for Arabic support in Excel
function writeCSVWithBOM(filePath: string, content: string): void {
  const BOM = '\uFEFF';
  fs.writeFileSync(filePath, BOM + content, 'utf8');
}

// Format date as YYYY-MM-DD HH:mm:ss (local time)
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get weekday name
function getWeekday(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// Format hours as HH:mm
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Format hours and minutes as HH:mm
function formatHHMM(hours: number, minutes: number): string {
  return `${Math.floor(hours)}:${String(minutes).padStart(2, '0')}`;
}

// Abort if any command ID is outside the allowed list
function verifyCommandIds(): void {
  const commandCounts = getCommandCounts();
  for (const [cmdId] of commandCounts) {
    if (!ALLOWED_COMMAND_IDS.has(cmdId)) {
      throw new Error(`ABORT: Command ID ${cmdId} is outside the allowed list`);
    }
  }
}

// Abort if any command was blocked by the allowlist
function verifyNoBlockedCommands(): void {
  const blockedCommands = getBlockedCommands();
  if (blockedCommands.size > 0) {
    const blockedList = Array.from(blockedCommands).join(', ');
    throw new Error(`ABORT: Allowlist blocked commands: ${blockedList}`);
  }
}

// Get date range for last 7 days
function getLast7Days(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date);
  }
  
  return dates;
}

// Check if two dates are the same day
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// Filter attendance records for last 7 days
function filterLast7Days(records: Array<{ deviceUserId: string; recordTime: Date; punch: number; status: number }>): Array<{ deviceUserId: string; recordTime: Date; punch: number; status: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return records.filter(r => r.recordTime >= sevenDaysAgo && r.recordTime < new Date(today.getTime() + 24 * 60 * 60 * 1000));
}

async function main() {
  console.log('=== STAGE 4: Weekly Attendance Report ===');
  console.log(`Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log();

  // Reset tracking
  resetCommandCounts();
  resetBlockedCommands();

  // Load users from CSV
  const users = loadUsers();
  console.log(`✓ Loaded ${users.size} users from out/users_device.csv`);

  // Set overall timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('ABORT: Operation timed out after 60 seconds')), TIMEOUT_MS);
  });

  try {
    const operationPromise = (async () => {
      // Create safe client with allowlist
      const client = createSafeZKClient(DEVICE_IP, DEVICE_PORT, 10000);

      // Connect
      console.log('Connecting to device...');
      await client.connect();
      console.log('✓ Connected');

      // Get info
      console.log('Getting device info...');
      const info = await client.getInfo();
      console.log('✓ Got info');
      console.log(`  - Log count: ${info.logCounts}`);

      // Get attendances
      console.log('Getting attendance records...');
      const attendances = await client.getAttendances((received, total) => {
        console.log(`  Progress: ${received}/${total}`);
      });
      console.log(`✓ Got ${attendances.length} attendance records`);

      // Verify command IDs are within allowed list
      verifyCommandIds();
      console.log('✓ All command IDs are within allowed list');

      // Verify no commands were blocked
      verifyNoBlockedCommands();
      console.log('✓ No commands were blocked by allowlist');

      // Disconnect
      console.log('Disconnecting...');
      await client.disconnect();
      console.log('✓ Disconnected');

      // Filter for last 7 days
      const last7Days = getLast7Days();
      const filteredRecords = filterLast7Days(attendances);
      console.log(`✓ Filtered to ${filteredRecords.length} records in last 7 days`);

      // Write raw attendance CSV
      const rawCSVPath = path.join(OUTPUT_DIR, 'attendance_week_raw.csv');
      const rawHeader = 'pin,recordTime,punch,status\n';
      const rawRows = filteredRecords.map(r => 
        `${r.deviceUserId},"${formatDateTime(r.recordTime)}",${r.punch},${r.status}`
      ).join('\n');
      writeCSVWithBOM(rawCSVPath, rawHeader + rawRows);
      console.log(`✓ Wrote raw attendance to ${rawCSVPath}`);

      // Generate daily report
      const reportRows: Array<{
        pin: string;
        name: string;
        date: string;
        weekday: string;
        check_in: string;
        check_out: string;
        punches: number;
        hours: number;
        minutes: number;
        total_hhmm: string;
        note: string;
      }> = [];

      for (const pin of Array.from(users.keys()).sort((a, b) => parseInt(a) - parseInt(b))) {
        const name = users.get(pin)!;
        
        for (const day of last7Days) {
          const dateStr = formatDate(day);
          const weekday = getWeekday(day);
          
          // Get all punches for this user on this day
          const dayRecords = filteredRecords
            .filter(r => r.deviceUserId === pin && isSameDay(r.recordTime, day))
            .sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime());
          
          if (dayRecords.length === 0) {
            // No punches
            reportRows.push({
              pin,
              name,
              date: dateStr,
              weekday,
              check_in: '',
              check_out: '',
              punches: 0,
              hours: 0,
              minutes: 0,
              total_hhmm: '',
              note: 'absent / no punch',
            });
          } else if (dayRecords.length === 1) {
            // One punch only
            reportRows.push({
              pin,
              name,
              date: dateStr,
              weekday,
              check_in: formatTime(dayRecords[0].recordTime),
              check_out: '',
              punches: 1,
              hours: 0,
              minutes: 0,
              total_hhmm: '',
              note: 'incomplete (1 punch)',
            });
          } else {
            // Multiple punches - remove duplicates (less than 2 minutes apart)
            const uniquePunches: Date[] = [dayRecords[0].recordTime];
            for (let i = 1; i < dayRecords.length; i++) {
              const prev = uniquePunches[uniquePunches.length - 1];
              const current = dayRecords[i].recordTime;
              const diffMs = current.getTime() - prev.getTime();
              if (diffMs >= 2 * 60 * 1000) {
                uniquePunches.push(current);
              }
            }
            
            const checkIn = uniquePunches[0];
            const checkOut = uniquePunches[uniquePunches.length - 1];
            const diffMs = checkOut.getTime() - checkIn.getTime();
            const hours = Math.floor(diffMs / (60 * 60 * 1000));
            const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
            
            let note = '';
            if (diffMs > 16 * 60 * 60 * 1000) {
              note = 'check manually';
            }
            
            reportRows.push({
              pin,
              name,
              date: dateStr,
              weekday,
              check_in: formatTime(checkIn),
              check_out: formatTime(checkOut),
              punches: dayRecords.length,
              hours,
              minutes,
              total_hhmm: formatHHMM(hours, minutes),
              note,
            });
          }
        }
      }

      // Write weekly report CSV
      const reportCSVPath = path.join(OUTPUT_DIR, 'weekly_report.csv');
      const reportHeader = 'pin,name,date,weekday,check_in,check_out,punches,hours,minutes,total_hhmm,note\n';
      const reportCSVRows = reportRows.map(r => 
        `${r.pin},"${r.name.replace(/"/g, '""')}",${r.date},${r.weekday},"${r.check_in}","${r.check_out}",${r.punches},${r.hours},${r.minutes},"${r.total_hhmm}","${r.note}"`
      ).join('\n');
      writeCSVWithBOM(reportCSVPath, reportHeader + reportCSVRows);
      console.log(`✓ Wrote weekly report to ${reportCSVPath}`);

      // Generate totals
      const totalsRows: Array<{
        pin: string;
        name: string;
        days_present: number;
        total_hours: number;
        total_minutes: number;
        total_hhmm: string;
        incomplete_days: number;
      }> = [];

      for (const pin of Array.from(users.keys()).sort((a, b) => parseInt(a) - parseInt(b))) {
        const name = users.get(pin)!;
        const userRows = reportRows.filter(r => r.pin === pin);
        
        const days_present = userRows.filter(r => r.punches > 0).length;
        const incomplete_days = userRows.filter(r => r.note === 'incomplete (1 punch)' || r.note === 'check manually').length;
        
        let totalMinutes = 0;
        for (const row of userRows) {
          totalMinutes += row.hours * 60 + row.minutes;
        }
        
        const total_hours = Math.floor(totalMinutes / 60);
        const total_minutes = totalMinutes % 60;
        
        totalsRows.push({
          pin,
          name,
          days_present,
          total_hours,
          total_minutes,
          total_hhmm: formatHHMM(total_hours, total_minutes),
          incomplete_days,
        });
      }

      // Write totals CSV
      const totalsCSVPath = path.join(OUTPUT_DIR, 'weekly_totals.csv');
      const totalsHeader = 'pin,name,days_present,total_hours,total_minutes,total_hhmm,incomplete_days\n';
      const totalsCSVRows = totalsRows.map(r => 
        `${r.pin},"${r.name.replace(/"/g, '""')}",${r.days_present},${r.total_hours},${r.total_minutes},"${r.total_hhmm}",${r.incomplete_days}`
      ).join('\n');
      writeCSVWithBOM(totalsCSVPath, totalsHeader + totalsCSVRows);
      console.log(`✓ Wrote weekly totals to ${totalsCSVPath}`);

      // Sanity checks
      console.log();
      console.log('=== Sanity Checks ===');
      
      const recordTimes = filteredRecords.map(r => r.recordTime);
      const earliestTime = recordTimes.length > 0 ? new Date(Math.min(...recordTimes.map(d => d.getTime()))) : null;
      const latestTime = recordTimes.length > 0 ? new Date(Math.max(...recordTimes.map(d => d.getTime()))) : null;
      
      console.log(`Earliest recordTime: ${earliestTime ? formatDateTime(earliestTime) : 'N/A'}`);
      console.log(`Latest recordTime: ${latestTime ? formatDateTime(latestTime) : 'N/A'}`);
      
      const now = new Date();
      const futureCount = filteredRecords.filter(r => r.recordTime > now).length;
      console.log(`Records dated in the future: ${futureCount}`);
      
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const oldCount = filteredRecords.filter(r => r.recordTime < twoYearsAgo).length;
      console.log(`Records older than 2 years: ${oldCount}`);
      
      const userPins = new Set(users.keys());
      const unknownUserIds = filteredRecords.filter(r => !userPins.has(r.deviceUserId)).map(r => r.deviceUserId);
      const distinctUnknownUserIds = new Set(unknownUserIds);
      console.log(`Records with deviceUserId not matching a pin in users_device.csv: ${unknownUserIds.length} (distinct: ${distinctUnknownUserIds.size})`);
      
      const punchCounts = new Map<number, number>();
      const statusCounts = new Map<number, number>();
      for (const r of filteredRecords) {
        punchCounts.set(r.punch, (punchCounts.get(r.punch) || 0) + 1);
        statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
      }
      
      console.log('Distinct punch values with counts:');
      for (const [punch, count] of Array.from(punchCounts.entries()).sort((a, b) => a[0] - b[0])) {
        console.log(`  Punch ${punch}: ${count}`);
      }
      
      console.log('Distinct status values with counts:');
      for (const [status, count] of Array.from(statusCounts.entries()).sort((a, b) => a[0] - b[0])) {
        console.log(`  Status ${status}: ${count}`);
      }
      
      console.log(`Records received: ${filteredRecords.length}`);
      console.log(`Log count from getInfo(): ${info.logCounts}`);

      // Verification for lowest pin
      const lowestPin = Array.from(users.keys()).sort((a, b) => parseInt(a) - parseInt(b))[0];
      const lowestPinRows = reportRows.filter(r => r.pin === lowestPin);
      
      console.log();
      console.log(`=== Verification for pin ${lowestPin} ===`);
      for (const row of lowestPinRows) {
        console.log(`Date: ${row.date}, Check-in: ${row.check_in}, Check-out: ${row.check_out}, Punches: ${row.punches}, Hours: ${row.hours}, Minutes: ${row.minutes}`);
      }

      // Print command IDs sent
      const commandCounts = getCommandCounts();
      console.log();
      console.log('=== Command IDs Sent ===');
      for (const [cmdId, count] of Array.from(commandCounts).sort((a, b) => a[0] - b[0])) {
        console.log(`Command ID ${cmdId}: ${count} time(s)`);
      }

      // Print blocked commands (should be empty)
      const blockedCommands = getBlockedCommands();
      console.log();
      console.log('=== Blocked Commands (by allowlist) ===');
      if (blockedCommands.size === 0) {
        console.log('No commands blocked');
      } else {
        for (const cmdId of Array.from(blockedCommands).sort((a, b) => a - b)) {
          console.log(`Command ID ${cmdId}: BLOCKED`);
        }
      }

      console.log();
      console.log('=== Output Files ===');
      console.log(`Raw attendance: ${rawCSVPath}`);
      console.log(`Weekly report: ${reportCSVPath}`);
      console.log(`Weekly totals: ${totalsCSVPath}`);

      return attendances;
    })();

    // Race between operation and timeout
    await Promise.race([operationPromise, timeoutPromise]);

  } catch (error) {
    console.error();
    console.error('=== ERROR ===');
    console.error((error as Error).message);

    // Print command IDs even on error
    const commandCounts = getCommandCounts();
    console.log();
    console.log('=== Command IDs Sent (before error) ===');
    for (const [cmdId, count] of Array.from(commandCounts).sort((a, b) => a[0] - b[0])) {
      console.log(`Command ID ${cmdId}: ${count} time(s)`);
    }

    // Print blocked commands
    const blockedCommands = getBlockedCommands();
    console.log();
    console.log('=== Blocked Commands (by allowlist) ===');
    if (blockedCommands.size === 0) {
      console.log('No commands blocked');
    } else {
      for (const cmdId of Array.from(blockedCommands).sort((a, b) => a - b)) {
        console.log(`Command ID ${cmdId}: BLOCKED`);
      }
    }

    process.exit(1);
  }
}

main();
