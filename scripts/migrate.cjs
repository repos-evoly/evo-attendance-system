const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MIGRATIONS_DIR = path.join(__dirname, "../database/migrations");

async function runMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  let lockAcquired = false;

  try {
    await client.connect();
    console.log("Connected to PostgreSQL.");

    // Prevent two migration processes from running simultaneously.
    await client.query("SELECT pg_advisory_lock(20261104, 1)");
    lockAcquired = true;

    // Track migrations that have already been applied.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/i.test(file))
      .sort();

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);

      // Remove a possible UTF-8 BOM.
      const sql = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();

      if (!sql) {
        throw new Error(`Migration file is empty: ${file}`);
      }

      const checksum = crypto
        .createHash("sha256")
        .update(sql)
        .digest("hex");

      const existing = await client.query(
        "SELECT checksum FROM schema_migrations WHERE migration_name = $1",
        [file]
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(
            `Applied migration was modified: ${file}. Create a new migration instead.`
          );
        }

        console.log(`Already applied: ${file}`);
        continue;
      }

      console.log(`Applying: ${file}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO schema_migrations (migration_name, checksum)
           VALUES ($1, $2)`,
          [file, checksum]
        );

        await client.query("COMMIT");
        console.log(`Successfully applied: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("All migrations completed.");
  } catch (error) {
    console.error("Migration failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(20261104, 1)");
      } catch (error) {
        console.error("Could not release migration lock:", error.message);
      }
    }

    await client.end();
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exitCode = 1;
} else {
  runMigrations();
}
