/**
 * One-time setup script: creates the single initial admin account.
 *
 * This is the only way to create an account - there is no public
 * registration endpoint. It is safe to run repeatedly: the insert relies on
 * the unique `users.username` index (`ON CONFLICT DO NOTHING`), so a second
 * run never creates a duplicate.
 *
 * The plaintext password is never stored or printed; only a scrypt hash is
 * written. The hash format matches `src/lib/auth/password.ts`.
 *
 * Usage:
 *   npm run db:create-admin                        # admin / admin
 *   ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run db:create-admin
 */

const { Client } = require("pg");
const { randomBytes, scrypt } = require("node:crypto");

// Must stay in sync with src/lib/auth/password.ts.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const USERNAME = process.env.ADMIN_USERNAME || "admin";
const PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const ROLE = "ADMIN";

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(SALT_LENGTH);

    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          [
            "scrypt",
            SCRYPT_N,
            SCRYPT_R,
            SCRYPT_P,
            salt.toString("base64"),
            derivedKey.toString("base64"),
          ].join("$")
        );
      }
    );
  });
}

async function createAdmin() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const passwordHash = await hashPassword(PASSWORD);

    const result = await client.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING
       RETURNING user_id`,
      [USERNAME, passwordHash, ROLE]
    );

    if (result.rowCount === 0) {
      console.log(`Admin account "${USERNAME}" already exists. Nothing to do.`);
      return;
    }

    console.log(`Created admin account "${USERNAME}".`);
    console.log("Change the password before exposing this app to a network.");
  } catch (error) {
    console.error("Could not create the admin account:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exitCode = 1;
} else {
  createAdmin();
}
