/**
 * Check which pins in punches are not in employees table.
 */

import { getDatabase } from './db.js';

const db = getDatabase();
const unknownPins = db.prepare(`
  SELECT DISTINCT p.pin, COUNT(*) as count
  FROM punches p
  LEFT JOIN employees e ON p.pin = e.pin
  WHERE e.pin IS NULL
  GROUP BY p.pin
  ORDER BY p.pin
`).all() as Array<{ pin: string; count: number }>;

console.log('=== Unknown Pins (in punches but not in employees) ===');
console.log(`Total distinct unknown pins: ${unknownPins.length}\n`);

for (const row of unknownPins) {
  console.log(`PIN ${row.pin}: ${row.count} punches`);
}

db.close();
