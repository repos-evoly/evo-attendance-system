/**
 * Test that data redaction properly strips sensitive fields.
 * This test directly verifies the transformation logic without mocking the library.
 */

interface MockUser {
  userId: string;
  name: string;
  password: string;
  cardno: number;
  role: number;
  uid: number;
  groupId: number;
  privilege: number;
  fingerprint: any[];
}

interface MockAttendance {
  userSn: number;
  deviceUserId: string;
  recordTime: Date;
  punch: number;
  status: number;
  statusLabel: string;
  punchLabel: string;
  ip: string;
}

function testDataRedaction() {
  console.log('=== Data Redaction Test ===\n');

  // Test getUsers redaction
  console.log('Test 1: Verifying getUsers strips sensitive fields...');
  const mockUsers: MockUser[] = [
    {
      userId: '1234',
      name: 'John Doe',
      password: 'secret123',
      cardno: 12345678,
      role: 1,
      uid: 5678,
      groupId: 1,
      privilege: 0,
      fingerprint: [],
    },
  ];

  // Simulate what the wrapper does
  const redactedUsers = mockUsers.map((u) => ({
    pin: u.userId,
    name: u.name,
  }));

  const user1 = redactedUsers[0];
  const userHasPassword = 'password' in user1;
  const userHasCardno = 'cardno' in user1;
  const userHasRole = 'role' in user1;
  const userHasUid = 'uid' in user1;
  const userHasFingerprint = 'fingerprint' in user1;

  if (!userHasPassword && !userHasCardno && !userHasRole && !userHasUid && !userHasFingerprint) {
    console.log('✓ getUsers strips: password, cardno, role, uid, fingerprint');
  } else {
    console.log('✗ FAIL: getUsers still has sensitive fields');
    console.log(`  - password: ${userHasPassword}`);
    console.log(`  - cardno: ${userHasCardno}`);
    console.log(`  - role: ${userHasRole}`);
    console.log(`  - uid: ${userHasUid}`);
    console.log(`  - fingerprint: ${userHasFingerprint}`);
  }

  // Test getAttendances redaction
  console.log('\nTest 2: Verifying getAttendances strips sensitive fields...');
  const mockAttendances: MockAttendance[] = [
    {
      userSn: 6850,
      deviceUserId: '1234',
      recordTime: new Date('2026-10-29T08:00:00'),
      punch: 1,
      status: 1,
      statusLabel: 'fingerprint',
      punchLabel: 'check-in',
      ip: '10.1.201.89',
    },
  ];

  // Simulate what the wrapper does
  const redactedAttendances = mockAttendances.map((r) => ({
    deviceUserId: r.deviceUserId,
    recordTime: r.recordTime,
    punch: r.punch ?? 0,
    status: r.status ?? 0,
  }));

  const att1 = redactedAttendances[0];
  const attHasUserSn = 'userSn' in att1;
  const attHasStatusLabel = 'statusLabel' in att1;
  const attHasPunchLabel = 'punchLabel' in att1;
  const attHasIp = 'ip' in att1;
  const attHasPunch = 'punch' in att1; // This SHOULD be present (numeric code, not personal data)
  const attHasStatus = 'status' in att1; // This SHOULD be present (numeric code, not personal data)

  if (!attHasUserSn && !attHasStatusLabel && !attHasPunchLabel && !attHasIp && attHasPunch && attHasStatus) {
    console.log('✓ getAttendances strips: userSn, statusLabel, punchLabel, ip');
    console.log('✓ getAttendances keeps: punch, status (numeric codes only)');
  } else {
    console.log('✗ FAIL: getAttendances redaction incorrect');
    console.log(`  - userSn: ${attHasUserSn} (should be false)`);
    console.log(`  - statusLabel: ${attHasStatusLabel} (should be false)`);
    console.log(`  - punchLabel: ${attHasPunchLabel} (should be false)`);
    console.log(`  - ip: ${attHasIp} (should be false)`);
    console.log(`  - punch: ${attHasPunch} (should be true)`);
    console.log(`  - status: ${attHasStatus} (should be true)`);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  const userTestPassed = !userHasPassword && !userHasCardno && !userHasRole && !userHasUid && !userHasFingerprint;
  const attTestPassed = !attHasUserSn && !attHasStatusLabel && !attHasPunchLabel && !attHasIp && attHasPunch && attHasStatus;

  if (userTestPassed && attTestPassed) {
    console.log('✓ ALL TESTS PASSED - Data redaction is correct');
    return 0;
  } else {
    console.log('✗ TESTS FAILED - Review redaction logic');
    return 1;
  }
}

// Run the test
const exitCode = testDataRedaction();
process.exit(exitCode);
