/**
 * User encoding utilities for Windows-1256 (Arabic) support.
 *
 * The ZKTeco library decodes user names as ASCII, which strips the high bit
 * from Windows-1256 encoded Arabic characters. This module provides correct
 * decoding using the TextDecoder API with windows-1256 encoding.
 */

/**
 * Decode a Buffer as Windows-1256 (Arabic) text.
 * Handles null bytes and whitespace trimming.
 */
export function decodeWindows1256(buffer: Buffer, maxLength?: number): string {
  const slice = maxLength ? buffer.subarray(0, maxLength) : buffer;

  // Find null terminator
  const nullIndex = slice.indexOf(0);
  const trimmed = nullIndex >= 0 ? slice.subarray(0, nullIndex) : slice;

  // Decode with Windows-1256
  const decoder = new TextDecoder('windows-1256');
  return decoder.decode(trimmed).trim();
}

/**
 * Parse user data from buffer with Windows-1256 decoding.
 * Supports both 72-byte and 28-byte user record formats.
 */
export function parseUserWithCorrectEncoding(
  userData: Buffer,
  packetSize: number,
): { pin: string; name: string } {
  if (packetSize === 72) {
    // 72-byte format
    const pin = decodeWindows1256(userData.subarray(48, 57)); // userId at offset 48, length 9
    const name = decodeWindows1256(userData.subarray(11, 35)); // name at offset 11, length 24
    return { pin, name };
  } else if (packetSize === 28) {
    // 28-byte format
    const userId = userData.readUIntLE(24, 4);
    const pin = String(userId);
    const name = decodeWindows1256(userData.subarray(8, 16)); // name at offset 8, length 8
    return { pin, name };
  } else {
    throw new Error(`Unsupported user packet size: ${packetSize}`);
  }
}

/**
 * Parse users from buffer with Windows-1256 decoding.
 */
export function parseUsersFromBufferWithCorrectEncoding(
  data: Buffer,
  packetSize: number,
): Array<{ pin: string; name: string }> {
  const users: Array<{ pin: string; name: string }> = [];
  let userData = data.subarray(4); // Skip first 4 bytes (header)

  while (userData.length >= packetSize) {
    const user = parseUserWithCorrectEncoding(userData.subarray(0, packetSize), packetSize);
    users.push(user);
    userData = userData.subarray(packetSize);
  }

  return users;
}
