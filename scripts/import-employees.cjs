/**
 * Initial official employee import into the existing PostgreSQL `employee`
 * table.
 *
 * Usage:
 *   node --env-file=.env scripts/import-employees.cjs --dry-run   # inspect only
 *   node --env-file=.env scripts/import-employees.cjs             # apply import
 *
 * Safety:
 *   - Uses the existing DATABASE_URL configuration (never hardcoded).
 *   - Inserts only MISSING employee IDs; existing rows are never modified.
 *   - Aborts (writing nothing) when an existing ID has a different name.
 *   - phone and hire_date are left NULL.
 *   - Touches ONLY the `employee` table; creates no tables and never writes
 *     to `device_punches` or `sync_runs`.
 */

const { Client } = require("pg");

// Official employee records (names/departments/job titles preserved exactly).
const EMPLOYEES = [
  { employee_id: 1, full_name: "محمد العريبي", department: "IT Support", job_title: "IT-Support" },
  { employee_id: 2, full_name: "آية صالح", department: "Call Centre", job_title: "Call Center" },
  { employee_id: 3, full_name: "فاطمة الزهراء محمد", department: "Call Centre", job_title: "Call Center" },
  { employee_id: 4, full_name: "خديجة مفتاح", department: "Call Centre", job_title: "Call Center" },
  { employee_id: 5, full_name: "أمل الشيخي", department: "Call Centre", job_title: "Call Center" },
  { employee_id: 6, full_name: "عاطف النايلي", department: "Other", job_title: "Reception" },
  { employee_id: 8, full_name: "إبراهيم المنصوري", department: "Developmer", job_title: "Network Eng" },
  { employee_id: 9, full_name: "سليمان الزلاوي", department: "IT Support", job_title: "IT-Support" },
  { employee_id: 12, full_name: "هديل الزاوي", department: "IT Support", job_title: "IT-Support" },
  { employee_id: 13, full_name: "نزار الهوني", department: "Other", job_title: "Marketing" },
  { employee_id: 14, full_name: "يزن عزوز", department: "Developmer", job_title: "Software Eng" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing.");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    // Baseline: raw device punches must never change during this import.
    const punchesBefore = await client.query("SELECT COUNT(*)::int AS n FROM device_punches");
    const punchesBeforeCount = punchesBefore.rows[0].n;

    // Inspect current rows.
    const existing = await client.query(
      "SELECT employee_id, full_name, department, job_title FROM employee ORDER BY employee_id",
    );
    const byId = new Map(existing.rows.map((row) => [row.employee_id, row]));

    console.log(`Existing employees: ${existing.rowCount}`);
    for (const row of existing.rows) {
      console.log(
        `  #${row.employee_id}  ${row.full_name}  [${row.department ?? "NULL"}]  [${row.job_title ?? "NULL"}]`,
      );
    }
    console.log(`Device punches (baseline): ${punchesBeforeCount}`);

    // Classify each official record.
    const toInsert = [];
    const skipped = [];
    const conflicts = [];

    for (const emp of EMPLOYEES) {
      const current = byId.get(emp.employee_id);
      if (!current) {
        toInsert.push(emp);
      } else if (current.full_name === emp.full_name) {
        skipped.push({ supplied: emp, existing: current });
      } else {
        conflicts.push({ supplied: emp, existing: current });
      }
    }

    console.log("\nImport plan");
    console.log(`  To insert : ${toInsert.length}`);
    console.log(`  Already present (skipped): ${skipped.length}`);
    console.log(`  Conflicts : ${conflicts.length}`);

    if (skipped.length > 0) {
      console.log("\n  Skipped (ID exists, name matches):");
      for (const { supplied, existing: cur } of skipped) {
        console.log(`    #${supplied.employee_id}  ${cur.full_name}`);
      }
    }

    if (conflicts.length > 0) {
      console.error("\nCONFLICT: existing employee IDs have different names. Aborting; nothing was written.");
      for (const { supplied, existing: cur } of conflicts) {
        console.error(
          `  #${supplied.employee_id}  existing="${cur.full_name}"  supplied="${supplied.full_name}"`,
        );
      }
      process.exitCode = 1;
      return;
    }

    if (dryRun) {
      console.log("\nDry run complete. No changes were made.");
      return;
    }

    if (toInsert.length === 0) {
      console.log("\nNothing to insert.");
    } else {
      await client.query("BEGIN");
      try {
        for (const emp of toInsert) {
          await client.query(
            `INSERT INTO employee (employee_id, full_name, department, job_title, phone, hire_date)
             VALUES ($1, $2, $3, $4, NULL, NULL)
             ON CONFLICT (employee_id) DO NOTHING`,
            [emp.employee_id, emp.full_name, emp.department, emp.job_title],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`\nInserted ${toInsert.length} employee(s).`);
    }

    // Verification.
    const after = await client.query(
      "SELECT employee_id, full_name, department, job_title, phone, hire_date, is_active FROM employee ORDER BY employee_id",
    );
    const punchesAfter = await client.query("SELECT COUNT(*)::int AS n FROM device_punches");
    const punchesAfterCount = punchesAfter.rows[0].n;

    console.log("\nVerification");
    console.log(`  Total employees: ${after.rowCount}`);
    for (const row of after.rows) {
      console.log(
        `    #${row.employee_id}  ${row.full_name}  [${row.department ?? "NULL"}]  [${row.job_title ?? "NULL"}]  phone=${row.phone ?? "NULL"}  hire_date=${row.hire_date ?? "NULL"}  active=${row.is_active}`,
      );
    }
    console.log("  ID conflicts: none");
    console.log(`  Device punches: before=${punchesBeforeCount} after=${punchesAfterCount} unchanged=${punchesBeforeCount === punchesAfterCount}`);
  } catch (error) {
    console.error("Import failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
