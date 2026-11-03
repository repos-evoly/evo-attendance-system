/**
 * Set employee active status.
 * CLI: npm run employee:set-active -- --pin 13 --active 0
 */

import { getDatabase } from './db.js';

function runSetActiveCLI(args: string[]): void {
  const pinArgIndex = args.indexOf('--pin');
  const activeArgIndex = args.indexOf('--active');

  if (pinArgIndex === -1 || activeArgIndex === -1 || pinArgIndex + 1 >= args.length || activeArgIndex + 1 >= args.length) {
    console.error('Usage: npm run employee:set-active -- --pin <PIN> --active <0|1>');
    process.exit(1);
  }

  const pin = args[pinArgIndex + 1];
  const activeValue = args[activeArgIndex + 1];

  if (activeValue !== '0' && activeValue !== '1') {
    console.error('Error: --active must be 0 or 1');
    process.exit(1);
  }

  const active = parseInt(activeValue, 10);

  const db = getDatabase();

  // Check if employee exists
  const employee = db.prepare('SELECT pin, name, active FROM employees WHERE pin = ?').get(pin) as { pin: string; name: string; active: number } | undefined;

  if (!employee) {
    console.error(`Error: Employee with PIN ${pin} not found`);
    db.close();
    process.exit(1);
  }

  // Update active status
  db.prepare('UPDATE employees SET active = ? WHERE pin = ?').run(active, pin);

  console.log(`PIN: ${pin}`);
  console.log(`Active: ${active}`);

  db.close();
}

runSetActiveCLI(process.argv.slice(2));
