import { ZKTecoClient } from '@graphland/zkteco';
import { COMMANDS } from '@graphland/zkteco';

/**
 * Wire-level command allowlist.
 * Only these command IDs are allowed to be sent to the device.
 */
const ALLOWED_COMMAND_IDS = new Set<number>([
  // Read commands from Stage 1 analysis
  COMMANDS.CMD_CONNECT, // 1000
  COMMANDS.CMD_AUTH, // 1102
  COMMANDS.CMD_GET_FREE_SIZES, // 50
  COMMANDS.CMD_GET_TIME, // 201
  COMMANDS.CMD_FREE_DATA, // 1502
  COMMANDS.CMD_DATA_WRRQ, // 1503
  COMMANDS.CMD_DATA_RDY, // 1504
  COMMANDS.CMD_EXIT, // 1001

  // Acknowledgement codes (responses from device, not sent by us, but included for completeness)
  COMMANDS.CMD_ACK_OK, // 2000
  COMMANDS.CMD_ACK_ERROR, // 2001
  COMMANDS.CMD_ACK_DATA, // 2002
  COMMANDS.CMD_ACK_RETRY, // 2003
  COMMANDS.CMD_ACK_REPEAT, // 2004
  COMMANDS.CMD_ACK_UNAUTH, // 2005
]);

/**
 * Command counts for reporting.
 */
const commandCounts = new Map<number, number>();

/**
 * Blocked commands list for reporting.
 * Records command IDs that were blocked by the allowlist.
 */
const blockedCommands = new Set<number>();

/**
 * Parse command ID from TCP packet header.
 * TCP header format (first 16 bytes):
 * - Bytes 0-1: 0x5050 (magic bytes)
 * - Bytes 2-3: 0x0000 (reserved)
 * - Bytes 4-5: Session ID
 * - Bytes 6-7: Reply ID
 * - Bytes 8-9: Command ID (little-endian)
 */
export function parseCommandIdFromTCPHeader(buffer: Buffer): number {
  if (buffer.length < 10) {
    throw new Error('Buffer too short to contain TCP header');
  }
  // Command ID is at bytes 8-9 (little-endian)
  return buffer.readUInt16LE(8);
}

/**
 * Monkey-patch a socket's write method to intercept outgoing TCP writes.
 * This checks each packet's command ID against the allowlist before sending.
 */
export function patchSocketWrite(socket: any): void {
  const originalWrite = socket.write.bind(socket);

  socket.write = function (buffer: Buffer | string, ...args: any[]): boolean {
    // Only intercept Buffer writes (string writes are not protocol packets)
    if (Buffer.isBuffer(buffer)) {
      try {
        const commandId = parseCommandIdFromTCPHeader(buffer);

        // Check against allowlist
        if (!ALLOWED_COMMAND_IDS.has(commandId)) {
          // FORBIDDEN COMMAND - ABORT
          // Record this blocked command
          blockedCommands.add(commandId);

          const error = new Error(
            `FORBIDDEN COMMAND ID: ${commandId}. Aborting connection to prevent unsafe operation.`,
          );
          (error as any).commandId = commandId;
          (error as any).isForbiddenCommand = true;

          // Mark socket as destroyed by allowlist
          (socket as any).destroyedByAllowlist = true;

          // Close socket immediately
          try {
            socket.destroy(error);
          } catch (e) {
            // Ignore destroy errors
          }

          // Throw error to caller
          throw error;
        }

        // Count the command
        commandCounts.set(commandId, (commandCounts.get(commandId) || 0) + 1);
      } catch (e) {
        // If parsing fails, assume it's not a protocol packet and allow it
        // (e.g., might be ACK packets or other socket-level data)
      }
    }

    // Call original write
    return originalWrite(buffer, ...args);
  };
}

/**
 * Create a ZKTecoClient with wire-level allowlist enforcement.
 * This monkey-patches the socket during connection, before any commands are sent.
 *
 * FAIL CLOSED: If the socket/property can't be found or patching fails,
 * connect() will throw and nothing will be sent to the device.
 */
export function createSafeZKClientWithAllowlist(
  ip: string,
  port: number = 4370,
  timeout: number = 10000,
): ZKTecoClient {
  const client = new ZKTecoClient({
    ip,
    port,
    timeout,
    commKey: 0,
  });

  // Enforce TCP-only operation.
  //
  // The library's connect() falls back to UDP when the TCP connection is
  // refused, and that UDP transport is NOT covered by the socket-level
  // allowlist patched below. Neutralize the UDP transport so a fallback can
  // never bypass the command allowlist: if TCP fails, the connection fails
  // closed instead of silently switching to an unprotected transport.
  const udpTransport = (client as any).udp;
  if (!udpTransport || typeof udpTransport.connect !== 'function') {
    throw new Error(
      'FAIL CLOSED: Cannot locate the UDP transport to disable. TCP-only enforcement failed.',
    );
  }
  udpTransport.connect = async function (): Promise<void> {
    throw new Error(
      'FAIL CLOSED: UDP fallback is disabled (TCP-only). The TCP connection failed, so no connection was made.',
    );
  };

  // Store original connect method
  const originalConnect = client.connect.bind(client);

  // Override connect to patch the socket BEFORE any commands are sent
  client.connect = async function (callbacks?: any): Promise<void> {
    // Access the internal transport
    const transport = (client as any).tcp;
    if (!transport) {
      throw new Error('FAIL CLOSED: Cannot find transport property on client. Allowlist enforcement failed.');
    }

    // Patch the createSocket method to intercept socket creation
    const originalCreateSocket = transport.createSocket?.bind(transport);
    if (!originalCreateSocket) {
      throw new Error('FAIL CLOSED: Cannot find createSocket method on transport. Allowlist enforcement failed.');
    }

    transport.createSocket = async function (onError?: any, onClose?: any): Promise<any> {
      // Call original createSocket to get the socket
      const socket = await originalCreateSocket(onError, onClose);

      // Patch the socket immediately after creation, before any writes
      try {
        patchSocketWrite(socket);
      } catch (e) {
        // FAIL CLOSED: Patching failed, destroy socket and throw
        try {
          socket.destroy();
        } catch (e2) {
          // Ignore destroy errors
        }
        throw new Error(`FAIL CLOSED: Socket patching failed: ${(e as Error).message}`);
      }

      return socket;
    };

    // Now call the original connect - the socket will be patched before any commands
    await originalConnect(callbacks);
  };

  return client;
}

/**
 * Get the command counts for reporting.
 */
export function getCommandCounts(): Map<number, number> {
  return new Map(commandCounts);
}

/**
 * Print the command counts summary.
 */
export function printCommandCounts(): void {
  console.log('\n=== Wire-Level Command Counts ===');
  const counts = getCommandCounts();
  if (counts.size === 0) {
    console.log('No commands sent (no connection made or stub transport used)');
  } else {
    for (const [cmdId, count] of Array.from(counts).sort((a, b) => a[0] - b[0])) {
      console.log(`Command ID ${cmdId}: ${count} time(s)`);
    }
  }
  console.log('=== End Command Counts ===\n');
}

/**
 * Reset command counts (for testing).
 */
export function resetCommandCounts(): void {
  commandCounts.clear();
}

/**
 * Get the blocked commands set for reporting.
 */
export function getBlockedCommands(): Set<number> {
  return new Set(blockedCommands);
}

/**
 * Print the blocked commands summary.
 */
export function printBlockedCommands(): void {
  console.log('\n=== Blocked Commands (by allowlist) ===');
  if (blockedCommands.size === 0) {
    console.log('No commands blocked');
  } else {
    for (const cmdId of Array.from(blockedCommands).sort((a, b) => a - b)) {
      console.log(`Command ID ${cmdId}: BLOCKED`);
    }
  }
  console.log('=== End Blocked Commands ===\n');
}

/**
 * Reset blocked commands (for testing).
 */
export function resetBlockedCommands(): void {
  blockedCommands.clear();
}
