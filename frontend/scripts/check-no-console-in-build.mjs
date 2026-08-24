#!/usr/bin/env node
/**
 * Regression guard for issue #92: "Login page writes the username to the
 * browser console".
 *
 * Acceptance criterion #3 requires a check that prevents a `console.*`
 * statement from reaching a production bundle. This script enforces it by
 * scanning the files Vite produces (the contents of `backend/dist/assets/`)
 * and failing with a non-zero exit code if any direct `console.<method>`
 * call survives minification.
 *
 * How it works:
 *   1. Look for the Vite output directory. By default Vite is configured
 *      with `build.outDir: '../backend/dist'`, so the production assets
 *      live in `backend/dist/assets/`. We also honour a `--out-dir`
 *      override (handy for testing in CI without a real build).
 *   2. For each `*.js` file in that directory, look for the pattern
 *      `console.<method>(...)` where `method` is one of the standard
 *      console methods (log/info/warn/error/debug/trace/table/...).
 *   3. Exit non-zero if any match survives.
 *
 *   The check is intentionally a post-build grep rather than a static
 *   analysis rule (e.g. an ESLint `no-console` rule): Vite/esbuild's
 *   `drop: ['console']` is the layer that *removes* the calls, and this
 *   script is the layer that *verifies* the removal actually happened
 *   on the bytes that ship to production. Catching a future regression
 *   where someone removes `drop: ['console']` from `vite.config.js` (or
 *   a future bundler change reintroduces console.*) is the whole point.
 *
 * Usage:
 *   node scripts/check-no-console-in-build.mjs
 *   node scripts/check-no-console-in-build.mjs --out-dir ../backend/dist
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = resolve(here, '..');
const repoRoot = resolve(frontendRoot, '..');

function parseArgs(argv) {
  const args = { outDir: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out-dir' && argv[i + 1]) {
      args.outDir = resolve(frontendRoot, argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
   
  console.log(`Usage: node scripts/check-no-console-in-build.mjs [--out-dir <path>]

Scans the Vite production build output for surviving console.* calls and
exits non-zero if any are found.

Defaults to the configured build.outDir (../backend/dist relative to the
frontend/ directory). Override with --out-dir for CI smoke checks.`);
}

// Match a console.<method>( call where method is a JS identifier. We allow
// member access to handle destructured locals too: `const { log } = console;
// log(...)` is *not* a regression - the check below intentionally targets
// the well-formed `console.foo(...)` shape that esbuild's `drop: ['console']`
// is supposed to remove.
//
// Word boundaries are implicit in the regex because `<method>` is
// restricted to `[A-Za-z_$][\w$]*`, and the surrounding characters are
// restricted to non-identifier characters on the left and `(` on the right.
const CONSOLE_CALL_RE = /(^|[^A-Za-z0-9_$.])(?:\.{0,2})console\.(log|info|warn|error|debug|trace|table|dir|group|groupCollapsed|groupEnd|timeEnd|timeLog|assert|count|countReset|profile|profileEnd|clear)\s*\(/g;

// Property-name lookup is *not* a regression in itself: a bundle that does
// `console['log'](...)` would still be removed by `drop: ['console']`
// because esbuild matches the *call site*, not the spelling of the
// property name. We rely on that and do not add bracket-notation matching.
async function findJsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip sourcemaps and large, generated HTML/JSON files. Vite writes
      // hashed JS into `assets/` by default, but we walk recursively so
      // custom rollupOptions.output.assetFileNames layouts keep working.
      out.push(...(await findJsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

async function scan(file) {
  const text = await readFile(file, 'utf8');
  const hits = [];
  for (const match of text.matchAll(CONSOLE_CALL_RE)) {
    hits.push(match[0]);
  }
  return hits;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  const outDir = args.outDir || resolve(repoRoot, 'backend/dist/assets');
  const repoRel = relative(repoRoot, outDir) || outDir;

  // Confirm the directory exists; missing build output is a separate
  // failure mode (the build didn't run) and we surface it explicitly so
  // the operator doesn't mis-read a silent zero-exit as "everything's
  // fine".
  let st;
  try {
    st = await stat(outDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
       
      console.error(
        `check-no-console-in-build: output directory does not exist: ${repoRel}\n` +
        `Run \`npm run build\` first, or pass --out-dir to point at the production bundle.`
      );
      return 2;
    }
    throw err;
  }
  if (!st.isDirectory()) {
     
    console.error(
        `check-no-console-in-build: ${repoRel} exists but is not a directory.`
      );
    return 2;
  }

  const files = await findJsFiles(outDir);
  if (files.length === 0) {
     
    console.error(
      `check-no-console-in-build: no .js files found under ${repoRel}.\n` +
      `Was the build run? Did build.outDir change?`
    );
    return 2;
  }

  let totalHits = 0;
  /** @type {Array<{file: string, hits: string[]}>} */
  const offenders = [];
  for (const file of files) {
    const hits = await scan(file);
    if (hits.length > 0) {
      offenders.push({ file: relative(repoRoot, file), hits });
      totalHits += hits.length;
    }
  }

  if (offenders.length === 0) {
     
    console.log(
      `check-no-console-in-build: ok - scanned ${files.length} bundle file(s) under ${repoRel}, no surviving console.* calls.`
    );
    return 0;
  }

   
  console.error(
    `check-no-console-in-build: FAIL - found ${totalHits} surviving console.* call(s) in ${offenders.length} bundle file(s):`
  );
  for (const { file, hits } of offenders) {
     
    console.error(`  ${file}:`);
    for (const h of hits.slice(0, 5)) {
       
      console.error(`    ${h.trim()}`);
    }
    if (hits.length > 5) {
       
      console.error(`    ...and ${hits.length - 5} more`);
    }
  }
   
  console.error(
    `\nA console.* call reached the production bundle. ` +
    `Either remove it from the source, or restore the Vite minifier drop rule:\n` +
    `  build: { rolldownOptions: { output: { minify: { compress: { dropConsole: true, dropDebugger: true } } } } }\n` +
    `See vite.config.js for the current configuration.`
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
     
    console.error('check-no-console-in-build: unexpected error:', err);
    process.exit(2);
  }
);