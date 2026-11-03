#!/usr/bin/env node
/**
 * Boundary check.
 *
 * Fails if any file under src/ imports from sync/, or any file under sync/
 * imports from src/. It scans static import/export/require/dynamic-import
 * specifiers and resolves both relative paths and the "@/*" alias, so bare,
 * relative and aliased cross-folder imports are all caught.
 *
 * Usage: node scripts/check-boundaries.mjs [rootDir]
 *   rootDir defaults to the repository root (the parent of scripts/).
 *
 * Exit code 0 = no boundary violations, 1 = violations found.
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(process.argv[2] ?? defaultRoot);
const APP_DIR = join(root, 'src');
const SYNC_DIR = join(root, 'sync');

const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'data', 'out', '.next', 'dist', 'build']);

const SPECIFIER_RE =
  /(?:^|[^\w$])(?:import\s+(?:[\s\S]*?\sfrom\s*)?|export\s+[\s\S]*?\sfrom\s*)['"]([^'"]+)['"]|(?:^|[^\w$])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (CODE_EXT.has(name.slice(name.lastIndexOf('.')))) files.push(full);
  }
  return files;
}

function specifiersOf(code) {
  const specs = [];
  for (const m of code.matchAll(SPECIFIER_RE)) specs.push(m[1] ?? m[2]);
  return specs.filter(Boolean);
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// Resolve the app path alias declared in the root tsconfig ("@/*" -> "./src/*")
// to an absolute filesystem path. Returns null for non-alias specifiers.
function aliasTarget(spec) {
  if (spec === '@') return APP_DIR;
  if (spec.startsWith('@/')) return join(APP_DIR, spec.slice(2));
  return null;
}

function check() {
  const violations = [];

  const scan = (dir, forbiddenDir, forbiddenLabel) => {
    for (const file of walk(dir)) {
      const code = readFileSync(file, 'utf8');
      for (const spec of specifiersOf(code)) {
        let hits = false;

        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec);
          hits = isInside(target, forbiddenDir) || target === forbiddenDir;
        } else {
          const alias = aliasTarget(spec);
          if (alias) {
            hits = isInside(alias, forbiddenDir) || alias === forbiddenDir;
          } else {
            const top = forbiddenLabel; // 'sync' for the app, 'src' for sync
            hits = spec === top || spec.startsWith(top + '/');
          }
        }

        if (hits) {
          violations.push(`${relative(root, file)} -> '${spec}' (forbidden: ${forbiddenLabel}/)`);
        }
      }
    }
  };

  scan(APP_DIR, SYNC_DIR, 'sync');
  scan(SYNC_DIR, APP_DIR, 'src');

  return violations;
}

const violations = check();

if (violations.length === 0) {
  console.log('Boundary check PASSED: no imports between src/ and sync/.');
  process.exit(0);
}

console.log(`Boundary check FAILED: ${violations.length} cross-boundary import(s) found:\n`);
for (const v of violations) console.log(`  - ${v}`);
process.exit(1);
