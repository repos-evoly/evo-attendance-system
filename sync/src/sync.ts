/**
 * Sync attendance data from the device to the local database.
 * READ-ONLY on the device. Uses safe client with allowlist.
 */

import { createSafeZKClient } from './safeClient.js';
import { getCommandCounts, getBlockedCommands, resetCommandCounts, resetBlockedCommands } from './allowlistTransport.js';
import {
  getDatabase,
  upsertEmployee,
  insertPunch,
  insertSyncRun,
  updateSyncRun,
  getSummary,
  formatLocalDateTime,
} from './db.js';
import { createLock, removeLock } from './syncLock.js';

// Configuration
const DEVICE_IP = '10.1.201.89';
const DEVICE_PORT = 4370;
const TIMEOUT_MS = 90000; // 90 seconds max for entire operation

// Allowed command IDs for sync
const ALLOWED_COMMAND_IDS = new Set<number>([
  1000, // CMD_CONNECT
  1102, // CMD_AUTH
  50,   // CMD_GET_FREE_SIZES
  201,  // CMD_GET_TIME
  1502, // CMD_FREE_DATA
  1503, // CMD_DATA_WRRQ
  1504, // CMD_DATA_RDY
  1001, // CMD_EXIT
]);

/**
 * Abort if any command ID is outside the allowed list.
 */
function verifyCommandIds(): void {
  const commandCounts = getCommandCounts();
  for (const [cmdId] of commandCounts) {
    if (!ALLOWED_COMMAND_IDS.has(cmdId)) {
      throw new Error(`ABORT: Command ID ${cmdId} is outside the allowed list`);
    }
  }
}

/**
 * Abort if any command was blocked by the allowlist.
 */
function verifyNoBlockedCommands(): void {
  const blockedCommands = getBlockedCommands();
  if (blockedCommands.size > 0) {
    const blockedList = Array.from(blockedCommands).join(', ');
    throw new Error(`ABORT: Allowlist blocked commands: ${blockedList}`);
  }
}

/**
 * Main sync function.
 * Exit codes: 0 = ok, 1 = failed, 2 = skipped
 */
async function sync(): Promise<number> {
  console.log('=== Syncing Attendance Data ===');
  console.log(`Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log();

  // Reset tracking
  resetCommandCounts();
  resetBlockedCommands();

  // Try to acquire lock
  if (!createLock()) {
    console.log('⚠ Another sync is already running (lock file exists and is not stale)');
    console.log('Skipping this sync run');
    return 2; // Exit code 2 = skipped
  }
  console.log('✓ Acquired sync lock');

  // Get database
  const db = getDatabase();

  // Insert sync run record
  const syncRunId = insertSyncRun(db);
  console.log(`✓ Started sync run ${syncRunId}`);

  let usersSeen = 0;
  let recordsSeen = 0;
  let recordsNew = 0;
  let suspectNew = 0;
  let error: string | null = null;
  let logCountFromInfo = 0;
  let status: 'ok' | 'failed' | 'ok_with_warning' = 'ok';
  let warningMessage: string | null = null;

  // Get existing device punch count for warning guard
  const existingDevicePunches = db.prepare('SELECT COUNT(*) as count FROM punches WHERE source = ?').get('device') as { count: number };

  let client: any = null;

  // Set overall timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('ABORT: Operation timed out after 90 seconds')), TIMEOUT_MS);
  });

  try {
    const operationPromise = (async () => {
      // Create safe client with allowlist
      client = createSafeZKClient(DEVICE_IP, DEVICE_PORT, 10000);

      // Connect
      console.log('Connecting to device...');
      await client.connect();
      console.log('✓ Connected');

      // Get info
      console.log('Getting device info...');
      const info = await client.getInfo();
      console.log('✓ Got info');
      console.log(`  - Log count: ${info.logCounts}`);
      logCountFromInfo = info.logCounts;

      // Get users
      console.log('Getting users...');
      const users = await client.getUsers();
      console.log(`✓ Got ${users.length} users`);
      usersSeen = users.length;

      // Upsert employees
      console.log('Upserting employees...');
      for (const user of users) {
        upsertEmployee(db, user.pin, user.name);
      }
      console.log('✓ Upserted employees');

      // Get attendances
      console.log('Getting attendance records...');
      const attendances = await client.getAttendances((received: number, total: number) => {
        console.log(`  Progress: ${received}/${total}`);
      });
      console.log(`✓ Got ${attendances.length} attendance records`);
      recordsSeen = attendances.length;

      // Verify command IDs are within allowed list
      verifyCommandIds();
      console.log('✓ All command IDs are within allowed list');

      // Verify no commands were blocked
      verifyNoBlockedCommands();
      console.log('✓ No commands were blocked by allowlist');

      // Warning guard: check if device returned fewer records than expected
      if (recordsSeen < existingDevicePunches.count) {
        status = 'ok_with_warning';
        warningMessage = `Device returned ${recordsSeen} records, but database has ${existingDevicePunches.count} existing device punches. Possible data loss or device configuration change. No destructive operations performed.`;
        console.log(`⚠ WARNING: ${warningMessage}`);
      } else if (recordsSeen === 0 && existingDevicePunches.count > 0) {
        status = 'ok_with_warning';
        warningMessage = `Device returned 0 records, but database has ${existingDevicePunches.count} existing device punches. Possible device error or data wipe. No destructive operations performed.`;
        console.log(`⚠ WARNING: ${warningMessage}`);
      }

      // Disconnect
      console.log('Disconnecting...');
      await client.disconnect();
      console.log('✓ Disconnected');
      client = null;

      // Insert punches in a single transaction (only if not a warning case)
      if (status === 'ok') {
        console.log('Inserting punches into database...');
        const insert = db.transaction(() => {
          for (const record of attendances) {
            const isNew = insertPunch(
              db,
              record.deviceUserId,
              record.recordTime,
              record.punch,
              record.status,
              'device',
            );
            if (isNew) {
              recordsNew++;
              if (formatLocalDateTime(record.recordTime) < '2020-01-01 00:00:00' ||
                  record.recordTime > new Date(Date.now() + 24 * 60 * 60 * 1000)) {
                suspectNew++;
              }
            }
          }
        });
        insert();
        console.log(`✓ Inserted ${recordsNew} new records (${suspectNew} suspect)`);
      } else {
        console.log('⚠ Skipping punch insertion due to warning');
      }

      // Update sync run
      updateSyncRun(db, syncRunId, status, usersSeen, recordsSeen, recordsNew, suspectNew, warningMessage || undefined);
      console.log(`✓ Sync run ${syncRunId} completed with status: ${status}`);

    })();

    // Race between operation and timeout
    await Promise.race([operationPromise, timeoutPromise]);

  } catch (err) {
    error = (err as Error).message;
    status = 'failed';
    console.error();
    console.error('=== ERROR ===');
    console.error(error);

    // Update sync run as failed
    updateSyncRun(db, syncRunId, 'failed', usersSeen, recordsSeen, recordsNew, suspectNew, error);
    console.log(`✓ Sync run ${syncRunId} marked as failed`);

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

    return 1; // Exit code 1 = failed
  } finally {
    // Always disconnect if still connected
    if (client) {
      try {
        console.log('Disconnecting (cleanup)...');
        await client.disconnect();
        console.log('✓ Disconnected');
      } catch (e) {
        // Ignore disconnect errors
      }
    }

    // Always release lock
    removeLock();
    console.log('✓ Released sync lock');

    // Close database
    db.close();
  }

  // Print summary
  console.log();
  console.log('=== Verification ===');
  console.log(`Records received: ${recordsSeen}`);
  console.log(`Log count from getInfo(): ${logCountFromInfo}`);
  console.log(`Records new: ${recordsNew}`);
  console.log(`Suspect records new: ${suspectNew}`);

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

  // Return exit code based on status
  if (status === 'ok' || status === 'ok_with_warning') {
    return 0; // Success (warning is still success, no destructive operation)
  }
  return 1; // Should not reach here, but return failure for safety
}

// Run sync and exit with appropriate code
sync().then(exitCode => {
  process.exit(exitCode);
}).catch(() => {
  process.exit(1);
});
