# attendance-sync

An isolated, **read-only** attendance sync service for the ZKTeco attendance
device. It connects to the device over TCP, reads users and attendance punches,
and stores them in a local SQLite database.

This folder was extracted from the earlier `zk-device-poc` prototype and moved
into the app repository as a self-contained package. It has its own
`package.json`, `node_modules`, `tsconfig.json` and dependencies, and it does
**not** import anything from the Next.js app (and vice versa). The app consumes
the resulting SQLite file; the two code bases never call each other.

## Isolation from the app

- The root `tsconfig.json` excludes `sync`, so app type-checking ignores it.
- The root ESLint config ignores `sync/**`.
- The root `.gitignore` ignores `sync/node_modules`, `sync/data`, `sync/out`,
  `sync/.env*`, `sync/*.db` and `sync/*.csv`.
- `npm run check:boundaries` in the repository root fails if any file under
  `src/` imports from `sync/`, or any file under `sync/` imports from `src/`.

## Safety design

The service is intentionally limited so that it cannot modify or erase data on
the device.

- **Closure-protected safe client** (`src/safeClient.ts`). The underlying
  `ZKTecoClient` is held in a closure and is not reachable from outside. Only
  `connect`, `disconnect`, `getInfo`, `getTime`, `getUsers` and `getAttendances`
  are exposed.
- **Wire-level command allowlist** (`src/allowlistTransport.ts`). The socket's
  `write` is monkey-patched so that every outgoing TCP packet's command ID is
  checked before it is sent. Only these command IDs are permitted:
  `1000` CONNECT, `1102` AUTH, `50` GET_FREE_SIZES, `201` GET_TIME,
  `1502` FREE_DATA, `1503` DATA_WRRQ, `1504` DATA_RDY, `1001` EXIT (plus the
  device ACK codes `2000`-`2005`, which are responses). Any other command ID
  aborts the connection: the socket is destroyed and an error is thrown.
- **Fail-closed.** If the transport/socket cannot be located and patched,
  `connect()` throws before anything is written to the device.
- **Read-only, no write or clear commands.** The safe client never calls any
  mutating device API: `clearAttendanceLog`, `resetDevice`, `deleteUser`,
  `createUser`, `updateUser`, `setTime`, `openDoor`, `refreshData`,
  `disableDevice`, `enableDevice`, `replaceAttendanceLog`,
  `deleteAttendanceRecord` and `getFingerprintTemplates` are never used.
- **Data redaction.** `getUsers` returns `pin` and `name` only (no password,
  card number, role or templates). `getAttendances` returns `deviceUserId`,
  `recordTime` and numeric `punch`/`status` codes only (no location or labels).
- **Warning guard** (`src/sync.ts`). If the device returns fewer attendance
  records than the database already holds, the run is marked `ok_with_warning`
  and **no** punches are inserted, guarding against an accidental device wipe.
- **Concurrency lock** (`src/syncLock.ts`). A lock file prevents two syncs from
  running at once; a lock older than 15 minutes is treated as stale.
- **Suspect-date flagging** (`src/db.ts`). Punches dated before 2020-01-01 or
  more than one day in the future are stored with `suspect = 1`.

## Requirements and install

- Node.js 18 or newer.

```bash
cd sync
npm ci --ignore-scripts
```

`better-sqlite3` ships a prebuilt binary, so `--ignore-scripts` avoids a native
build step. Use `npm install` if `npm ci` cannot run against the lock file.

## Running the scripts

All commands are run from inside `sync/`.

| Script | What it does |
| --- | --- |
| `npm run sync` | Sync users and attendance from the device into the SQLite DB. **Connects to the device.** |
| `npm run sync:status` | Print last successful sync, its age, recent runs and total punches (DB only). |
| `npm run db:summary` | Print database summary statistics (DB only). |
| `npm run report` | Generate an attendance report CLI (DB only). |
| `npm run employee:set-active` | Set an employee's active flag: `npm run employee:set-active -- --pin <PIN> --active <0\|1>` (DB only). |
| `npm run check-unknown-pins` | List pins present in punches but missing from employees (DB only). |
| `npm run inspect-data` | Inspect attendance data as numbers only (DB only). |
| `npm run compare-reports` | Compare a generated report against an older report CSV (files only). |
| `npm run verify-report` | Rebuild and verify a specific report range (DB only). |
| `npm run stage:users` | Read-only user import stage. **Connects to the device.** |
| `npm run stage:attendance` | Read-only attendance import stage. **Connects to the device.** |
| `npm run test-stage2` | Read-only device connectivity/protocol test. **Connects to the device.** |
| `npm run test-allowlist` | Allowlist enforcement test (stub socket, no network). |
| `npm run test-safe-client` | Safe client API-surface test (no network connection). |
| `npm run test-user-encoding` | Windows-1256 Arabic name decoding test. |
| `npm run test-db` | Database insert/dedupe/suspect tests (in-memory SQLite). |
| `npm run test-sync-guards` | Lock-file and warning-guard tests. |
| `npm run test-report` | Report builder tests (in-memory SQLite). |
| `npm run test-employee-set-active` | `employee:set-active` tests (in-memory SQLite). |
| `npm run test-data-redaction` | Verifies sensitive fields are stripped. |
| `npm run test-integration` | Allowlist against the local fake server (`127.0.0.1` only). |

## Environment variables

The service currently reads **no** environment variables. Only names are listed
here:

- `PG_SYNC_URL` — reserved name for a future Postgres sync target. It is **not
  read by any code** in this folder yet.

Device address settings are **hardcoded constants**, not environment
variables, in `src/sync.ts` (and the read-only stage scripts): `DEVICE_IP` and
`DEVICE_PORT` (the ZKTeco device on the local network, TCP port 4370). There is
no environment override for them.

## Scripts that connect to the real device

Do not run these unless you explicitly intend to contact the device:

- `npm run sync` (`src/sync.ts`)
- `npm run stage:users` (`src/stage3a-users.ts`)
- `npm run stage:attendance` (`src/stage4-attendance.ts`)
- `npm run test-stage2` (`src/test-stage2.ts`)

Two tests are safe but worth noting:

- `npm run test-safe-client` constructs a client configured for the device
  address but **never calls `connect()`**; it only inspects the exposed API.
- `npm run test-integration` connects **only** to a local fake server on
  `127.0.0.1`.

## Data and artifacts

- SQLite database: `data/attendance.db` (relative to the working directory),
  in WAL mode.
- Lock file: `data/sync.lock`.
- Generated reports: `out/`.

These are all git-ignored and are never committed.

See [STAGE1_REPORT.md](./STAGE1_REPORT.md) for the original library analysis
and evidence.
