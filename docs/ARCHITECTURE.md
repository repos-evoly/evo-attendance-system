# Architecture

## Data flow

```
device  ->  sync  ->  PostgreSQL  ->  web app
```

1. The **device** records fingerprint punches. It is read over TCP.
2. The **sync service** (`sync/`) reads users and punches from the device and
   writes them to PostgreSQL. It runs as its own process.
3. **PostgreSQL** is the only integration point. It holds raw punches,
   corrections, employees and all settings.
4. The **web app** (`src/`) reads PostgreSQL and displays attendance; it will
   compute salaries. It never talks to the device.

## The three parts

- **Web app** — `src/`, a Next.js app. Pages display data; all logic lives in
  `src/server/`.
- **Sync service** — `sync/`, a separate Node process with its own
  `package.json`, `node_modules` and `tsconfig.json`. It is never imported by
  the web app, and it never imports the web app.
- **Database** — PostgreSQL, described by migrations under `db/`.

## Rules

- **Raw punches are immutable.** A punch read from the device is never edited
  or deleted. Any correction is recorded as a separate *corrections* record;
  the effective value is the raw punch plus its corrections.
- **Business rules only in `src/server/`**, written as **pure functions with
  tests**. Pages and routes only call them and display the result.
- **Settings live in the database, not in code.** Shifts, grace periods,
  holidays and rates are data, read at runtime.
- **The sync connects with its own restricted database role**, separate from
  the app role. It only writes what it needs to (punches and users).
- **The device is only ever read, never written.** No clearing, deleting,
  resetting or time-setting commands are sent to the device.
- **Money uses exact decimals** (never binary floating point); **time uses
  whole minutes**.

## Boundaries

`sync/` and `src/` must not import each other. This is enforced by
`npm run check:boundaries`, which is part of `npm run check`.
