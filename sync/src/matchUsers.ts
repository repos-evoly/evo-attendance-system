import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

interface DeviceUser {
  pin: string;
  name: string;
}

interface ZKBioEmployee {
  emp_pin: string;
  emp_firstname: string;
  emp_lastname: string;
}

interface MatchResult {
  totalDeviceUsers: number;
  pinMatches: number;
  nameMatches: number;
  mismatchedPins: string[];
}

/**
 * Normalize Arabic letters and case for name comparison.
 * Handles common Arabic letter variants and case normalization.
 */
function normalizeName(name: string): string {
  // Trim whitespace
  let normalized = name.trim();

  // Normalize to lowercase for case-insensitive comparison
  normalized = normalized.toLowerCase();

  // Normalize Arabic letter variants (common alternatives)
  // Example: alef forms (أ ا إ آ)
  normalized = normalized.replace(/[أإآ]/g, 'ا');
  // Teh marbuta to heh (ة -> ه)
  normalized = normalized.replace(/ة/g, 'ه');
  // Yeh forms (ي ى)
  normalized = normalized.replace(/ى/g, 'ي');

  return normalized;
}

/**
 * Match device users with ZKBio TimeNet database.
 * Reads from a COPY of TimeNet.db (never the production database).
 */
export function matchDeviceUsersWithZKBio(
  deviceUsers: DeviceUser[],
  timeNetDbPath: string,
  outputCsvPath: string,
): MatchResult {
  // Ensure output directory exists
  const outputDir = path.dirname(outputCsvPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Open TimeNet database (COPY, not production)
  const db = new Database(timeNetDbPath, { readonly: true });

  try {
    // Read all employees from hr_employee table
    const employees = db
      .prepare('SELECT emp_pin, emp_firstname, emp_lastname FROM hr_employee')
      .all() as ZKBioEmployee[];

    // Create a map of emp_pin to employee for fast lookup
    const empPinMap = new Map<string, ZKBioEmployee>();
    for (const emp of employees) {
      empPinMap.set(emp.emp_pin, emp);
    }

    // Write CSV file
    const csvLines: string[] = ['pin,device_name,zkbio_name'];
    const mismatchedPins: string[] = [];
    let pinMatches = 0;
    let nameMatches = 0;

    for (const deviceUser of deviceUsers) {
      const zkbioEmp = empPinMap.get(deviceUser.pin);
      let zkbioName = '';

      if (zkbioEmp) {
        pinMatches++;
        zkbioName = `${zkbioEmp.emp_firstname} ${zkbioEmp.emp_lastname}`;

        // Compare normalized names
        const deviceNameNormalized = normalizeName(deviceUser.name);
        const zkbioNameNormalized = normalizeName(zkbioName);

        if (deviceNameNormalized === zkbioNameNormalized) {
          nameMatches++;
        } else {
          mismatchedPins.push(deviceUser.pin);
        }
      } else {
        mismatchedPins.push(deviceUser.pin);
      }

      csvLines.push(`${deviceUser.pin},"${deviceUser.name}","${zkbioName}"`);
    }

    // Write CSV
    fs.writeFileSync(outputCsvPath, csvLines.join('\n'), 'utf-8');

    return {
      totalDeviceUsers: deviceUsers.length,
      pinMatches,
      nameMatches,
      mismatchedPins,
    };
  } finally {
    db.close();
  }
}
