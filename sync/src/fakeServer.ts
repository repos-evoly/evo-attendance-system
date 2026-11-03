/**
 * Fake ZKTeco TCP server for testing allowlist enforcement.
 * Listens on 127.0.0.1:4370 and logs all command IDs received.
 */

import * as net from 'net';

/**
 * TCP prefix as used by the ZKTeco library.
 */
const TCP_PREFIX = Buffer.from([
  0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00,
]);

/**
 * Parse command ID from TCP packet.
 * TCP packet format:
 * - Bytes 0-3: 0x5050 0x827d (magic bytes)
 * - Bytes 4-7: length field (prefix)
 * - Bytes 8-9: Command ID (little-endian)
 * - Bytes 10-11: Checksum
 * - Bytes 12-13: Session ID
 * - Bytes 14-15: Reply ID
 * - Bytes 16+: Data
 */
function parseCommandId(buffer: Buffer): number {
  if (buffer.length < 16) {
    return -1;
  }
  // Skip the 8-byte TCP prefix, command ID is at byte 8 of the payload
  return buffer.readUInt16LE(8);
}

/**
 * Create a checksum for the buffer (matching ZKTeco protocol).
 */
function createChecksum(buf: Buffer): number {
  const USHRT_MAX = 65535;
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i]!;
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= USHRT_MAX;
  }
  return USHRT_MAX - chksum - 1;
}

/**
 * Build a TCP response packet.
 */
function buildTCPResponse(commandId: number, sessionId: number, replyId: number, data: Buffer = Buffer.alloc(0)): Buffer {
  // Build the header (8 bytes + data)
  const headerBuf = Buffer.alloc(8 + data.length);
  headerBuf.writeUInt16LE(commandId, 0);
  headerBuf.writeUInt16LE(0, 2); // Checksum placeholder
  headerBuf.writeUInt16LE(sessionId, 4);
  headerBuf.writeUInt16LE(replyId, 6);
  if (data.length > 0) {
    data.copy(headerBuf, 8);
  }

  // Calculate and set checksum
  const checksum = createChecksum(headerBuf);
  headerBuf.writeUInt16LE(checksum, 2);

  // Add TCP prefix
  const prefix = Buffer.from(TCP_PREFIX);
  prefix.writeUInt16LE(headerBuf.length, 4); // Set length in prefix

  return Buffer.concat([prefix, headerBuf]);
}

/**
 * Command ID names for logging.
 */
const COMMAND_NAMES: Record<number, string> = {
  1000: 'CMD_CONNECT',
  1001: 'CMD_EXIT',
  1102: 'CMD_AUTH',
  50: 'CMD_GET_FREE_SIZES',
  201: 'CMD_GET_TIME',
  1502: 'CMD_FREE_DATA',
  1503: 'CMD_DATA_WRRQ',
  1504: 'CMD_DATA_RDY',
  1501: 'CMD_DATA',
  2000: 'CMD_ACK_OK',
  2001: 'CMD_ACK_ERROR',
  2002: 'CMD_ACK_DATA',
  2003: 'CMD_ACK_RETRY',
  2004: 'CMD_ACK_REPEAT',
  2005: 'CMD_ACK_UNAUTH',
  14: 'CMD_CLEAR_DATA',
  15: 'CMD_CLEAR_ATTLOG',
  18: 'CMD_DELETE_USER',
  8: 'CMD_USER_WRQ',
  31: 'CMD_UNLOCK',
  9: 'CMD_USER',
};

/**
 * Log of all commands received.
 */
const commandLog: Array<{ commandId: number; timestamp: Date }> = [];

/**
 * Fake user data for testing.
 */
const FAKE_USERS = [
  { pin: '1', name: 'John Doe' },
  { pin: '2', name: 'Jane Smith' },
  { pin: '3', name: 'Bob Johnson' },
];

/**
 * Fake attendance data for testing.
 */
const FAKE_ATTENDANCES = [
  { deviceUserId: '1', recordTime: new Date('2024-01-15T08:00:00'), punch: 0, status: 0 },
  { deviceUserId: '2', recordTime: new Date('2024-01-15T08:05:00'), punch: 0, status: 0 },
  { deviceUserId: '1', recordTime: new Date('2024-01-15T17:00:00'), punch: 0, status: 0 },
];

/**
 * Track current data transfer state.
 */
let currentDataType: 'users' | 'attendances' | null = null;
let dataTransferIndex = 0;

/**
 * Start the fake server.
 */
export function startFakeServer(port: number = 4370, host: string = '127.0.0.1'): net.Server {
  const server = net.createServer((socket: net.Socket) => {
    console.log(`[FAKE SERVER] Client connected from ${socket.remoteAddress}:${socket.remotePort}`);

    let sessionId = 0;
    // Reset data transfer state for new connection
    currentDataType = null;
    dataTransferIndex = 0;

    socket.on('data', (data: Buffer) => {
      // Parse command ID from the first packet
      const commandId = parseCommandId(data);
      const commandName = COMMAND_NAMES[commandId] || `UNKNOWN(${commandId})`;

      console.log(`[FAKE SERVER] Received command ID: ${commandId} (${commandName})`);
      console.log(`[FAKE SERVER] Packet length: ${data.length} bytes`);

      // Log the command
      commandLog.push({ commandId, timestamp: new Date() });

      // Send plausible response based on command
      let response: Buffer;
      let replyId = 0;

      switch (commandId) {
        case 1000: // CMD_CONNECT
          // For CMD_CONNECT, we need to return the session ID in the payload
          sessionId = 1234; // Assign a fake session ID
          const connectData = Buffer.alloc(6);
          connectData.writeUInt16LE(2000, 0); // CMD_ACK_OK
          connectData.writeUInt16LE(sessionId, 4); // Session ID
          response = buildTCPResponse(2000, sessionId, replyId, connectData);
          break;

        case 1102: // CMD_AUTH
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        case 50: // CMD_GET_FREE_SIZES
          // Return mock free sizes (users, logs, fingerprints)
          // The library requires at least 76 bytes and reads specific offsets:
          // - userCounts from byte 24
          // - logCounts from byte 40
          // - logCapacity from byte 72
          const sizesData = Buffer.alloc(76);
          sizesData.writeUInt32LE(100, 24); // User count at offset 24
          sizesData.writeUInt32LE(1000, 40); // Log count at offset 40
          sizesData.writeUInt32LE(50000, 72); // Log capacity at offset 72
          response = buildTCPResponse(2000, sessionId, replyId, sizesData); // ACK_OK with data
          break;

        case 201: // CMD_GET_TIME
          // Return current time
          const timeData = Buffer.alloc(8);
          const now = new Date();
          timeData.writeUInt32LE(Math.floor(now.getTime() / 1000), 0); // Unix timestamp
          response = buildTCPResponse(2000, sessionId, replyId, timeData); // ACK_OK with data
          break;

        case 1502: // CMD_FREE_DATA
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        case 1503: // CMD_DATA_WRRQ
          // Parse the data to determine what type of data is being requested
          // The data contains 8 bytes: offset (4) + size (4)
          // We'll determine the type based on the previous CMD_FREE_DATA call
          // For simplicity, we'll alternate between users and attendances
          if (currentDataType === null) {
            // First data transfer - assume users
            currentDataType = 'users';
          }
          dataTransferIndex = 0;
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        case 1504: // CMD_DATA_RDY
          // When called directly via executeCmd, the library expects CMD_ACK_OK
          // When used in data streaming protocol, it expects CMD_DATA
          // For this test, we return CMD_ACK_OK to match the direct call
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        case 1501: // CMD_DATA (request for data)
          // Return fake data based on current transfer type
          // For now, we'll return a simple ACK_OK since the direct calls don't use this
          // This will be used when implementing the full read flow
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        case 1001: // CMD_EXIT
          response = buildTCPResponse(2000, sessionId, replyId); // ACK_OK
          break;

        default:
          // Unknown command - send ACK_ERROR
          console.log(`[FAKE SERVER] Unknown command ${commandId}, sending ACK_ERROR`);
          response = buildTCPResponse(2001, sessionId, replyId); // ACK_ERROR
      }

      socket.write(response);
      console.log(`[FAKE SERVER] Sent response for command ${commandId}`);
    });

    socket.on('end', () => {
      console.log('[FAKE SERVER] Client disconnected');
    });

    socket.on('error', (err: Error) => {
      console.error('[FAKE SERVER] Socket error:', err.message);
    });
  });

  server.listen(port, host, () => {
    console.log(`[FAKE SERVER] Listening on ${host}:${port}`);
  });

  return server;
}

/**
 * Get the command log.
 */
export function getCommandLog(): Array<{ commandId: number; timestamp: Date }> {
  return [...commandLog];
}

/**
 * Clear the command log.
 */
export function clearCommandLog(): void {
  commandLog.length = 0;
}

/**
 * Print the command log.
 */
export function printCommandLog(): void {
  console.log('\n=== Fake Server Command Log ===');
  if (commandLog.length === 0) {
    console.log('No commands received');
  } else {
    for (const entry of commandLog) {
      const commandName = COMMAND_NAMES[entry.commandId] || `UNKNOWN(${entry.commandId})`;
      console.log(`[${entry.timestamp.toISOString()}] Command ID: ${entry.commandId} (${commandName})`);
    }
  }
  console.log('=== End Command Log ===\n');
}
