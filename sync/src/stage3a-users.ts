/**
 * STAGE 3B: Re-read users with fixed Arabic decoding (READ-ONLY).
 *
 * Safety rules:
 * - Connect ONCE to 10.1.201.89:4370 using createSafeZKClientWithAllowlist
 * - Allowed calls ONLY: connect(), getInfo(), getUsers(), disconnect()
 * - Do NOT call getAttendances(), getTime(), or anything else
 * - Log every command ID sent
 * - If any ID outside the allowlist appears, or the allowlist blocks anything, abort immediately
 * - No retries. On any error or hang (over 30 seconds), disconnect and stop
 * - getUsers() must return only pin and name (no passwords, card numbers, roles, templates)
 */

import { createSafeZKClient } from './safeClient.js';
import { getCommandCounts, getBlockedCommands, resetCommandCounts, resetBlockedCommands } from './allowlistTransport.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DEVICE_IP = '10.1.201.89';
const DEVICE_PORT = 4370;
const TIMEOUT_MS = 30000; // 30 seconds max for entire operation
const OUTPUT_DIR = path.join(process.cwd(), 'out');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'users_device.csv');

// Allowed command IDs for this stage
const ALLOWED_COMMAND_IDS = new Set<number>([
  1000, // CMD_CONNECT
  1102, // CMD_AUTH
  50,   // CMD_GET_FREE_SIZES
  201,  // CMD_GET_TIME (called by getInfo)
  1502, // CMD_FREE_DATA
  1503, // CMD_DATA_WRRQ
  1504, // CMD_DATA_RDY
  1001, // CMD_EXIT
]);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Write CSV with UTF-8 BOM for Arabic support in Excel
function writeUsersToCSV(users: Array<{ pin: string; name: string }>): void {
  // UTF-8 BOM
  const BOM = '\uFEFF';
  const header = 'pin,name\n';
  const rows = users.map(u => `${u.pin},"${u.name.replace(/"/g, '""')}"`).join('\n');
  const csv = BOM + header + rows;
  fs.writeFileSync(OUTPUT_FILE, csv, 'utf8');
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

// Compare pins with previous run
function comparePins(currentPins: string[], expectedPins: string[]): { match: boolean; message: string } {
  const currentSet = new Set(currentPins);
  const expectedSet = new Set(expectedPins);

  if (currentPins.length !== expectedPins.length) {
    return {
      match: false,
      message: `Pin count mismatch: current=${currentPins.length}, expected=${expectedPins.length}`,
    };
  }

  const missing = expectedPins.filter(p => !currentSet.has(p));
  const extra = currentPins.filter(p => !expectedSet.has(p));

  if (missing.length > 0 || extra.length > 0) {
    return {
      match: false,
      message: `Pin mismatch. Missing: [${missing.join(', ')}], Extra: [${extra.join(', ')}]`,
    };
  }

  return { match: true, message: 'Pins match exactly' };
}

// Count Arabic characters in names
function countArabicCharacters(users: Array<{ pin: string; name: string }>): { withArabic: number; withoutArabic: number } {
  let withArabic = 0;
  let withoutArabic = 0;

  for (const user of users) {
    const hasArabic = [...user.name].some(char => {
      const code = char.codePointAt(0);
      return code !== undefined && code >= 0x0600 && code <= 0x06FF;
    });

    if (hasArabic) {
      withArabic++;
    } else {
      withoutArabic++;
    }
  }

  return { withArabic, withoutArabic };
}

async function main() {
  console.log('=== STAGE 3B: Re-read Users with Fixed Arabic Decoding ===');
  console.log(`Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log();

  // Reset tracking
  resetCommandCounts();
  resetBlockedCommands();

  // Set overall timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('ABORT: Operation timed out after 30 seconds')), TIMEOUT_MS);
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

      // Get users
      console.log('Getting users...');
      const users = await client.getUsers();
      console.log(`✓ Got ${users.length} users`);

      // Compare pins with previous run
      const expectedPins = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '12', '13', '14'];
      const currentPins = users.map(u => u.pin).sort((a, b) => parseInt(a) - parseInt(b));
      const pinComparison = comparePins(currentPins, expectedPins);
      console.log(`✓ Pin comparison: ${pinComparison.message}`);

      // Count Arabic characters
      const arabicCounts = countArabicCharacters(users);
      console.log(`✓ Names with Arabic characters: ${arabicCounts.withArabic}`);
      console.log(`✓ Names without Arabic characters: ${arabicCounts.withoutArabic}`);

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

      // Write to CSV
      writeUsersToCSV(users);
      console.log(`✓ Wrote users to ${OUTPUT_FILE}`);

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

      // Output user count and verification (NEVER names)
      console.log();
      console.log('=== Users Read ===');
      console.log(`User count: ${users.length}`);
      console.log(`Pins: ${currentPins.join(', ')}`);
      console.log(`Pin comparison: ${pinComparison.message}`);
      console.log(`Names with Arabic characters: ${arabicCounts.withArabic}`);
      console.log(`Names without Arabic characters: ${arabicCounts.withoutArabic}`);

      return users;
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
