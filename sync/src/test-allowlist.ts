/**
 * Test the wire-level allowlist enforcement.
 * This test uses a stub socket to verify forbidden commands are blocked.
 */

import { COMMANDS } from '@graphland/zkteco';
import { patchSocketWrite, getCommandCounts, resetCommandCounts, parseCommandIdFromTCPHeader } from './allowlistTransport.js';

// Mock socket class
class MockSocket {
  private closed = false;
  writeCalls: Buffer[] = [];
  private originalWrite: any;

  constructor() {
    this.originalWrite = this.write.bind(this);
  }

  write(buffer: Buffer | string, ...args: any[]): boolean {
    if (this.closed) {
      throw new Error('Socket is closed');
    }
    if (Buffer.isBuffer(buffer)) {
      this.writeCalls.push(buffer);
    }
    return true;
  }

  destroy(): void {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed;
  }

  getOriginalWrite(): any {
    return this.originalWrite;
  }
}

/**
 * Create a mock TCP header with a specific command ID.
 */
function createMockTCPHeader(commandId: number): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt16LE(0x5050, 0); // Magic bytes
  header.writeUInt16LE(0x0000, 2); // Reserved
  header.writeUInt16LE(1234, 4); // Session ID
  header.writeUInt16LE(5678, 6); // Reply ID
  header.writeUInt16LE(commandId, 8); // Command ID
  header.writeUInt16LE(0, 10); // Checksum (placeholder)
  header.writeUInt32LE(0, 12); // Packet length (placeholder)
  return header;
}

function testAllowlist() {
  console.log('=== Wire-Level Allowlist Test ===\n');

  // Reset counts
  resetCommandCounts();

  // Test 1: Allowed command should pass
  console.log('Test 1: Sending allowed command (CMD_CONNECT = 1000)...');
  const socket1 = new MockSocket();
  patchSocketWrite(socket1 as any);

  const allowedPacket = createMockTCPHeader(COMMANDS.CMD_CONNECT);
  try {
    socket1.write(allowedPacket);
    console.log('✓ Allowed command passed');
  } catch (e) {
    console.log('✗ FAIL: Allowed command was blocked');
    console.log(`  Error: ${(e as Error).message}`);
  }

  // Test 2: Forbidden command should abort
  console.log('\nTest 2: Sending forbidden command (CMD_CLEAR_ATTLOG = 15)...');
  const socket2 = new MockSocket();
  patchSocketWrite(socket2 as any);

  const forbiddenPacket = createMockTCPHeader(COMMANDS.CMD_CLEAR_ATTLOG);
  console.log(`  Forbidden packet command ID: ${COMMANDS.CMD_CLEAR_ATTLOG}`);
  console.log(`  Forbidden packet buffer length: ${forbiddenPacket.length}`);
  try {
    socket2.write(forbiddenPacket);
    console.log('✗ FAIL: Forbidden command was not blocked (no error thrown)');
    console.log(`  Write calls count: ${socket2.writeCalls.length}`);
  } catch (e) {
    const errorMessage = (e as Error).message;
    // Either the FORBIDDEN COMMAND error is thrown, or the socket is closed error
    // Both indicate the command was blocked
    if (errorMessage.includes('FORBIDDEN COMMAND') || errorMessage.includes('Socket is closed')) {
      console.log('✓ Forbidden command blocked');
      if (socket2.isClosed()) {
        console.log('✓ Socket was closed after forbidden command');
      } else {
        console.log('✗ Socket was not closed');
      }
    } else {
      console.log('✗ FAIL: Wrong error type:', errorMessage);
    }
  }

  // Test 3: Another forbidden command (CMD_CLEAR_DATA = 14)
  console.log('\nTest 3: Sending forbidden command (CMD_CLEAR_DATA = 14)...');
  const socket3 = new MockSocket();
  patchSocketWrite(socket3 as any);

  const forbiddenPacket2 = createMockTCPHeader(COMMANDS.CMD_CLEAR_DATA);
  try {
    socket3.write(forbiddenPacket2);
    console.log('✗ FAIL: Forbidden command was not blocked');
  } catch (e) {
    const errorMessage = (e as Error).message;
    if (errorMessage.includes('FORBIDDEN COMMAND') || errorMessage.includes('Socket is closed')) {
      console.log('✓ Forbidden command blocked');
    } else {
      console.log('✗ FAIL: Wrong error type:', errorMessage);
    }
  }

  // Test 4: Command counts
  console.log('\nTest 4: Checking command counts...');
  const counts = getCommandCounts();
  console.log('Command counts:', Array.from(counts.entries()).map(([id, count]) => `${id}: ${count}`).join(', '));

  // Test 5: Parse command ID from header
  console.log('\nTest 5: Testing command ID parsing...');
  const testPacket = createMockTCPHeader(COMMANDS.CMD_GET_TIME);
  const parsedId = parseCommandIdFromTCPHeader(testPacket);
  if (parsedId === COMMANDS.CMD_GET_TIME) {
    console.log(`✓ Correctly parsed command ID: ${parsedId}`);
  } else {
    console.log(`✗ FAIL: Parsed ${parsedId}, expected ${COMMANDS.CMD_GET_TIME}`);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  const test1Passed = socket1.writeCalls.length === 1; // Allowed command was written
  const test2Passed = socket2.isClosed() && !socket2.writeCalls.includes(forbiddenPacket); // Forbidden command blocked
  const test3Passed = socket3.isClosed() && !socket3.writeCalls.includes(forbiddenPacket2); // Forbidden command blocked
  const test5Passed = parsedId === COMMANDS.CMD_GET_TIME;

  if (test1Passed && test2Passed && test3Passed && test5Passed) {
    console.log('✓ ALL TESTS PASSED - Allowlist enforcement is working');
    return 0;
  } else {
    console.log('✗ TESTS FAILED');
    console.log(`  Test 1 (allowed command): ${test1Passed ? 'PASS' : 'FAIL'}`);
    console.log(`  Test 2 (forbidden CMD_CLEAR_ATTLOG): ${test2Passed ? 'PASS' : 'FAIL'}`);
    console.log(`  Test 3 (forbidden CMD_CLEAR_DATA): ${test3Passed ? 'PASS' : 'FAIL'}`);
    console.log(`  Test 5 (parsing): ${test5Passed ? 'PASS' : 'FAIL'}`);
    return 1;
  }
}

// Run the test
const exitCode = testAllowlist();
process.exit(exitCode);
