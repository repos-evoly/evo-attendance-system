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

/**
 * Full read-only view of a single device user record.
 *
 * Field offsets follow the ZKTeco 72-byte user record layout used by
 * `@graphland/zkteco` (see its `decodeUserData72` / `encodeUserInfo72`):
 *   0-1   uid                (uint16 LE, device-internal id)
 *   2     role / permission  (uint8; permission token)
 *   3-10  password           (8 bytes; NEVER exposed, only a populated flag)
 *   11-34 name               (24 bytes; Windows-1256 for Arabic)
 *   35-38 card number        (uint32 LE)
 *   39    group              (uint8, device group number — NOT a department name)
 *   40-41 useGroupTimezones  (uint16 LE)
 *   42-47 timezone slots 1-3 (3 x uint16 LE)
 *   48-56 userId / PIN       (9 bytes)
 *
 * The password value is intentionally never read into a string; only whether
 * the field is populated is reported.
 */
export interface DeviceUserDetail {
  uid: number;
  pin: string;
  name: string;
  roleRaw: number;
  roleValue: number;
  roleName: string;
  enabled: boolean;
  hasPassword: boolean;
  cardNumber: number;
  group: number;
  useGroupTimezones: boolean;
  timezones: number[];
}

// Role values per the library's own encoding convention (encodeUserInfo72).
const ROLE_NAME_BY_VALUE: Record<number, string> = {
  0: 'user',
  1: 'enroller',
  3: 'admin',
  7: 'superadmin',
};

/** True if any byte in the range is non-zero (used for the password field). */
function hasNonZeroBytes(buf: Buffer, offset: number, length: number): boolean {
  const slice = buf.subarray(offset, offset + length);
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] !== 0) return true;
  }
  return false;
}

/**
 * Decode the permission byte at offset 2 using the library's own convention:
 * bit0 = disabled, bit1..bit3 = role value.
 */
function decodePermissionToken(token: number): {
  roleValue: number;
  roleName: string;
  enabled: boolean;
} {
  const enabled = (token & 0x01) === 0;
  const roleValue = (token >> 1) & 0x07;
  return {
    roleValue,
    roleName: ROLE_NAME_BY_VALUE[roleValue] ?? `unknown(${roleValue})`,
    enabled,
  };
}

/**
 * Parse a single user record into the full read-only detail object.
 */
export function parseUserDetail(
  userData: Buffer,
  packetSize: number,
): DeviceUserDetail {
  if (packetSize === 72) {
    const token = userData.readUIntLE(2, 1);
    const decoded = decodePermissionToken(token);
    return {
      uid: userData.readUIntLE(0, 2),
      pin: decodeWindows1256(userData.subarray(48, 57)),
      name: decodeWindows1256(userData.subarray(11, 35)),
      roleRaw: token,
      roleValue: decoded.roleValue,
      roleName: decoded.roleName,
      enabled: decoded.enabled,
      hasPassword: hasNonZeroBytes(userData, 3, 8),
      cardNumber: userData.readUIntLE(35, 4),
      group: userData.readUIntLE(39, 1),
      useGroupTimezones: userData.readUIntLE(40, 2) !== 0,
      timezones: [
        userData.readUIntLE(42, 2),
        userData.readUIntLE(44, 2),
        userData.readUIntLE(46, 2),
      ],
    };
  }

  if (packetSize === 28) {
    const token = userData.readUIntLE(2, 1);
    const decoded = decodePermissionToken(token);
    return {
      uid: userData.readUIntLE(0, 2),
      pin: String(userData.readUIntLE(24, 4)),
      name: decodeWindows1256(userData.subarray(8, 16)),
      roleRaw: token,
      roleValue: decoded.roleValue,
      roleName: decoded.roleName,
      enabled: decoded.enabled,
      hasPassword: hasNonZeroBytes(userData, 3, 5),
      cardNumber: 0,
      group: 0,
      useGroupTimezones: false,
      timezones: [],
    };
  }

  throw new Error(`Unsupported user packet size: ${packetSize}`);
}

/**
 * Parse all user records into full read-only detail objects.
 */
export function parseUsersDetailedFromBuffer(
  data: Buffer,
  packetSize: number,
): DeviceUserDetail[] {
  const users: DeviceUserDetail[] = [];
  let userData = data.subarray(4); // Skip first 4 bytes (header)

  while (userData.length >= packetSize) {
    users.push(parseUserDetail(userData.subarray(0, packetSize), packetSize));
    userData = userData.subarray(packetSize);
  }

  return users;
}
