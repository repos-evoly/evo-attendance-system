/**
 * Stage 2: First real device contact - Read-only
 *
 * SAFETY RULES:
 * - Connect ONCE to 10.1.201.89:4370 using createSafeZKClientWithAllowlist
 * - Allowed calls ONLY: connect(), getInfo(), getTime(), disconnect()
 * - Do NOT call getUsers(), getAttendances(), or anything else
 * - Log every command ID sent
 * - If any ID is outside the allowlist, abort immediately
 * - No retries. On any error, disconnect and stop.
 */

import { createSafeZKClientWithAllowlist, resetCommandCounts, printCommandCounts, getCommandCounts, resetBlockedCommands, printBlockedCommands, getBlockedCommands } from './allowlistTransport.js';
import { COMMANDS } from '@graphland/zkteco';

const DEVICE_IP = '10.1.201.89';
const DEVICE_PORT = 4370;
const TIMEOUT = 10000;

async function testStage2() {
  console.log('=== Stage 2: First Real Device Contact - Read-Only ===\n');
  console.log(`Target device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log('Allowed operations: connect(), getInfo(), getTime(), disconnect()');
  console.log('Forbidden: getUsers(), getAttendances(), or any other operations\n');

  // Reset tracking
  resetCommandCounts();
  resetBlockedCommands();

  const client = createSafeZKClientWithAllowlist(DEVICE_IP, DEVICE_PORT, TIMEOUT);

  try {
    console.log('1. Connecting to device...');
    await client.connect();
    console.log('✓ Connected\n');

    console.log('2. Getting device info...');
    const info = await client.getInfo();
    console.log('✓ Got info:');
    console.log(`   User count: ${info.userCounts}`);
    console.log(`   Log count: ${info.logCounts}`);
    console.log(`   Log capacity: ${info.logCapacity}\n`);

    console.log('3. Getting device time...');
    const deviceTime = await client.getTime();
    console.log('✓ Got device time:', deviceTime.toISOString());

    const pcTime = new Date();
    console.log('   PC time:', pcTime.toISOString());

    const timeDiff = deviceTime.getTime() - pcTime.getTime();
    console.log(`   Time difference: ${timeDiff / 1000} seconds (${timeDiff > 0 ? 'device ahead' : 'device behind'})\n`);

    console.log('4. Disconnecting...');
    await client.disconnect();
    console.log('✓ Disconnected\n');

    // Print command counts
    printCommandCounts();

    // Print blocked commands
    printBlockedCommands();

    // Verify no blocked commands
    const blockedCommands = getBlockedCommands();
    if (blockedCommands.size > 0) {
      console.log('✗ ABORT: Forbidden commands were attempted and blocked');
      console.log('Blocked commands:', Array.from(blockedCommands));
      throw new Error('Forbidden commands were attempted');
    }

    // Verify command IDs are within allowlist
    const commandCounts = getCommandCounts();
    const allowedCommandIds: Set<number> = new Set([
      COMMANDS.CMD_CONNECT, // 1000
      COMMANDS.CMD_AUTH, // 1102
      COMMANDS.CMD_GET_FREE_SIZES, // 50
      COMMANDS.CMD_GET_TIME, // 201
      COMMANDS.CMD_EXIT, // 1001
    ]);

    let commandIdViolated = false;
    for (const cmdId of commandCounts.keys()) {
      if (!allowedCommandIds.has(cmdId)) {
        console.log(`✗ ABORT: Command ID ${cmdId} is outside the allowlist`);
        commandIdViolated = true;
      }
    }

    if (commandIdViolated) {
      throw new Error('Command ID outside allowlist was sent');
    }

    console.log('=== Stage 2 Summary ===');
    console.log('PC time:', pcTime.toISOString());
    console.log('Device time:', deviceTime.toISOString());
    console.log('Time difference:', timeDiff / 1000, 'seconds');
    console.log('User count:', info.userCounts);
    console.log('Log count:', info.logCounts);
    console.log('Log capacity:', info.logCapacity);
    console.log('Command IDs sent:', Array.from(commandCounts.keys()).sort((a, b) => a - b));
    console.log('Blocked commands:', Array.from(blockedCommands).sort((a, b) => a - b));
    console.log('\n✓ Stage 2 completed successfully');
    console.log('✓ Only allowed operations were performed');
    console.log('✓ No forbidden commands were attempted');
    console.log('✓ All command IDs are within the allowlist');

  } catch (e) {
    console.error('\n✗ Stage 2 FAILED:', (e as Error).message);
    console.error((e as Error).stack);

    // Attempt to disconnect on error
    try {
      console.log('\nAttempting emergency disconnect...');
      await client.disconnect();
      console.log('✓ Disconnected');
    } catch (disconnectError) {
      console.error('Disconnect failed:', (disconnectError as Error).message);
    }

    // Print command counts even on failure
    printCommandCounts();
    printBlockedCommands();

    process.exit(1);
  }
}

// Run the test
testStage2()
  .then(() => {
    console.log('\nStage 2 completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nStage 2 failed:', err);
    process.exit(1);
  });
