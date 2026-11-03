# attendance

Attendance and payroll dashboard for a fingerprint attendance device.

Punches recorded on the device are read by an isolated sync service into
PostgreSQL; the web app reads PostgreSQL and displays attendance, and will
compute salaries. Business logic lives in plain, tested functions; pages only
display.

## Folder layout

```
src/            Next.js app (App Router). UI and server code.
  app/          Routes and layouts.
  server/       Business rules as pure, tested functions.
sync/           Device sync service. A SEPARATE process with its own
                package.json, node_modules and toolchain.
db/             PostgreSQL migrations (added later).
docs/           Architecture notes and open decisions.
scripts/        Repository tooling (e.g. the boundary check).
```

## Commands

Run from the repository root unless noted.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run test` | Run the Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run check` | `tsc --noEmit`, then ESLint, then Vitest, then `next build`, then the boundary check |
| `npm run check:boundaries` | Fail if any file under `src/` imports from `sync/`, or any file under `sync/` imports from `src/` |

The sync service is run from inside `sync/` (see [sync/README.md](./sync/README.md)):

```bash
cd sync
npm ci --ignore-scripts
```

## Isolation rule

`sync/` is a **separate process** that talks to the device and to PostgreSQL.
It is **never imported by the web app**, and it never imports the web app.
The two code bases only meet in the database.

- The root `tsconfig.json` excludes `sync`.
- The root ESLint config ignores `sync/**`.
- `npm run check:boundaries` enforces the rule mechanically and is part of
  `npm run check`.

## Documentation

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — data flow and system rules.
- [docs/OPEN-DECISIONS.md](./docs/OPEN-DECISIONS.md) — unresolved payroll rules
  awaiting a decision.
