/**
 * Test Windows-1256 (Arabic) encoding for user names.
 */

import { decodeWindows1256, parseUserWithCorrectEncoding, parseUsersFromBufferWithCorrectEncoding } from './userEncoding.js';

console.log('=== Testing Windows-1256 Decoding ===\n');

// Test 1: Arabic name "محمد" (Muhammad)
console.log('Test 1: Arabic name "محمد" (Muhammad)');
const muhammadBytes = Buffer.from([0xE3, 0xCD, 0xE3, 0xCF]);
const muhammadDecoded = decodeWindows1256(muhammadBytes);
console.log(`  Input bytes: [${muhammadBytes.join(', ')}]`);
console.log(`  Decoded: "${muhammadDecoded}"`);
console.log(`  Expected: "محمد"`);
console.log(`  Pass: ${muhammadDecoded === 'محمد' ? '✓' : '✗'}\n`);

// Test 2: Arabic "ال" (Al)
console.log('Test 2: Arabic "ال" (Al)');
const alBytes = Buffer.from([0xC7, 0xE1]);
const alDecoded = decodeWindows1256(alBytes);
console.log(`  Input bytes: [${alBytes.join(', ')}]`);
console.log(`  Decoded: "${alDecoded}"`);
console.log(`  Expected: "ال"`);
console.log(`  Pass: ${alDecoded === 'ال' ? '✓' : '✗'}\n`);

// Test 3: Latin name (ASCII)
console.log('Test 3: Latin name "John" (ASCII)');
const johnBytes = Buffer.from([0x4A, 0x6F, 0x68, 0x6E]);
const johnDecoded = decodeWindows1256(johnBytes);
console.log(`  Input bytes: [${johnBytes.join(', ')}]`);
console.log(`  Decoded: "${johnDecoded}"`);
console.log(`  Expected: "John"`);
console.log(`  Pass: ${johnDecoded === 'John' ? '✓' : '✗'}\n`);

// Test 4: Digits
console.log('Test 4: Digits "123"');
const digitsBytes = Buffer.from([0x31, 0x32, 0x33]);
const digitsDecoded = decodeWindows1256(digitsBytes);
console.log(`  Input bytes: [${digitsBytes.join(', ')}]`);
console.log(`  Decoded: "${digitsDecoded}"`);
console.log(`  Expected: "123"`);
console.log(`  Pass: ${digitsDecoded === '123' ? '✓' : '✗'}\n`);

// Test 5: Null termination
console.log('Test 5: Null termination handling');
const nullBytes = Buffer.from([0x4A, 0x6F, 0x68, 0x6E, 0x00, 0x41, 0x42]);
const nullDecoded = decodeWindows1256(nullBytes);
console.log(`  Input bytes: [${nullBytes.join(', ')}]`);
console.log(`  Decoded: "${nullDecoded}"`);
console.log(`  Expected: "John" (should stop at null)`);
console.log(`  Pass: ${nullDecoded === 'John' ? '✓' : '✗'}\n`);

// Test 6: Trailing whitespace
console.log('Test 6: Trailing whitespace trimming');
const spaceBytes = Buffer.from([0x4A, 0x6F, 0x68, 0x6E, 0x20, 0x20]);
const spaceDecoded = decodeWindows1256(spaceBytes);
console.log(`  Input bytes: [${spaceBytes.join(', ')}]`);
console.log(`  Decoded: "${spaceDecoded}"`);
console.log(`  Expected: "John" (trimmed)`);
console.log(`  Pass: ${spaceDecoded === 'John' ? '✓' : '✗'}\n`);

// Test 7: Full 72-byte user record with Arabic name
console.log('Test 7: Full 72-byte user record with Arabic name');
const user72 = Buffer.alloc(72);
user72.writeUIntLE(1, 0, 2); // uid
user72.writeUIntLE(0, 2, 1); // role
user72.writeUIntLE(0, 35, 4); // cardno
// Write PIN at offset 48 (length 9)
Buffer.from('12345', 'ascii').copy(user72, 48);
// Write Arabic name "محمد" at offset 11 (length 24)
muhammadBytes.copy(user72, 11);

const user72Parsed = parseUserWithCorrectEncoding(user72, 72);
console.log(`  PIN: "${user72Parsed.pin}"`);
console.log(`  Name: "${user72Parsed.name}"`);
console.log(`  Expected PIN: "12345"`);
console.log(`  Expected Name: "محمد"`);
console.log(`  Pass: ${user72Parsed.pin === '12345' && user72Parsed.name === 'محمد' ? '✓' : '✗'}\n`);

// Test 8: Full 28-byte user record with Arabic name
console.log('Test 8: Full 28-byte user record with Arabic name');
const user28 = Buffer.alloc(28);
user28.writeUIntLE(1, 0, 2); // uid
user28.writeUIntLE(0, 2, 1); // role
user28.writeUIntLE(67890, 24, 4); // userId (PIN)
// Write Arabic name "ال" at offset 8 (length 8)
alBytes.copy(user28, 8);

const user28Parsed = parseUserWithCorrectEncoding(user28, 28);
console.log(`  PIN: "${user28Parsed.pin}"`);
console.log(`  Name: "${user28Parsed.name}"`);
console.log(`  Expected PIN: "67890"`);
console.log(`  Expected Name: "ال"`);
console.log(`  Pass: ${user28Parsed.pin === '67890' && user28Parsed.name === 'ال' ? '✓' : '✗'}\n`);

// Test 9: Parse multiple users from buffer
console.log('Test 9: Parse multiple users from buffer');
const multiUserBuffer = Buffer.alloc(4 + 72 * 2); // 4-byte header + 2 users
multiUserBuffer.writeUInt32LE(144, 0); // Header: total size
// User 1
const user1 = Buffer.alloc(72);
user1.writeUIntLE(1, 0, 2);
user1.writeUIntLE(0, 2, 1);
Buffer.from('1', 'ascii').copy(user1, 48);
muhammadBytes.copy(user1, 11);
user1.copy(multiUserBuffer, 4);
// User 2
const user2 = Buffer.alloc(72);
user2.writeUIntLE(2, 0, 2);
user2.writeUIntLE(0, 2, 1);
Buffer.from('2', 'ascii').copy(user2, 48);
alBytes.copy(user2, 11);
user2.copy(multiUserBuffer, 4 + 72);

const multiUsers = parseUsersFromBufferWithCorrectEncoding(multiUserBuffer, 72);
console.log(`  User count: ${multiUsers.length}`);
console.log(`  User 1 PIN: "${multiUsers[0].pin}", Name: "${multiUsers[0].name}"`);
console.log(`  User 2 PIN: "${multiUsers[1].pin}", Name: "${multiUsers[1].name}"`);
console.log(`  Expected: 2 users, PIN "1" name "محمد", PIN "2" name "ال"`);
console.log(`  Pass: ${multiUsers.length === 2 && multiUsers[0].pin === '1' && multiUsers[0].name === 'محمد' && multiUsers[1].pin === '2' && multiUsers[1].name === 'ال' ? '✓' : '✗'}\n`);

// Summary
console.log('=== Test Summary ===');
const allTestsPassed =
  muhammadDecoded === 'محمد' &&
  alDecoded === 'ال' &&
  johnDecoded === 'John' &&
  digitsDecoded === '123' &&
  nullDecoded === 'John' &&
  spaceDecoded === 'John' &&
  user72Parsed.pin === '12345' && user72Parsed.name === 'محمد' &&
  user28Parsed.pin === '67890' && user28Parsed.name === 'ال' &&
  multiUsers.length === 2 && multiUsers[0].pin === '1' && multiUsers[0].name === 'محمد' && multiUsers[1].pin === '2' && multiUsers[1].name === 'ال';

if (allTestsPassed) {
  console.log('✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
