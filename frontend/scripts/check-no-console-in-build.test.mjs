/**
 * Regression tests for issue #92 ("Login page writes the username to the
 * browser console") — specifically for the post-build guard script
 * `scripts/check-no-console-in-build.mjs`.
 *
 * These tests don't run a real Vite build; they synthesise fake bundle
 * files on disk, run the scanner against them, and assert that it
 * classifies the bundles as clean or dirty correctly. They exist to lock
 * in two contracts that the production check depends on:
 *
 *   1. A bundle that contains `console.log("foo")` is REJECTED — the
 *      script must exit non-zero so CI blocks the regression.
 *
 *   2. A bundle that contains code *mentioning* `console` but never
 *      actually *calling* it (e.g. comments, docstrings, property names
 *      passed as strings) is ACCEPTED — false positives would force the
 *      operator to either skip the check or disable it, defeating the
 *      whole point.
 *
 * The tests are written in plain `node:test` (built into Node 22+) so we
 * don't have to add Jest infrastructure just to verify a one-off build
 * script. They are not picked up by `npm run test` (which uses Jest and
 * scans `src` recursively for `*.test.{js,jsx}`); they are run by the
 * dedicated `test:build-guard` script in package.json.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = new URL('..', import.meta.url).pathname;
const scriptPath = join(here, 'check-no-console-in-build.mjs');

function runScanner(outDir) {
  const proc = spawnSync(
    process.execPath,
    [scriptPath, '--out-dir', outDir],
    { encoding: 'utf8' }
  );
  return {
    status: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
  };
}

async function makeCleanBundle() {
  const root = await mkdtemp(join(tmpdir(), 'console-guard-clean-'));
  const assets = join(root, 'assets');
  await mkdir(assets, { recursive: true });
  // Code that *mentions* console but never calls it — should pass.
  await writeFile(
    join(assets, 'app.clean.js'),
    [
      '// This file mentions console in a comment.',
      'const label = "console-style banner";',
      'function describe() {',
      '  return "console is not actually called here";',
      '}',
      'export default describe;',
      ''
    ].join('\n')
  );
  // Sub-directory walk also has to work — Vite keeps its hashed output
    // flat by default but a future `assetFileNames` change shouldn't
    // silently disable the check.
  const nested = join(assets, 'nested');
  await mkdir(nested, { recursive: true });
  await writeFile(
    join(nested, 'sub.js'),
    '// plain file, no console calls.\nexport const x = 1;\n'
  );
  return { root, assets };
}

async function makeDirtyBundle() {
  const root = await mkdtemp(join(tmpdir(), 'console-guard-dirty-'));
  const assets = join(root, 'assets');
  await mkdir(assets, { recursive: true });
  await writeFile(
    join(assets, 'login.js'),
    [
      'function login(username) {',
      '  // The following would leak the submitted username into the',
      '  // browser console in production — exactly what issue #92 asks',
      '  // us to prevent.',
      '  console.log("redirect uri:" + username);',
      '}',
      'export default login;',
      ''
    ].join('\n')
  );
  return { root, assets };
}

test('clean bundle: scanner exits 0 with no failures', async (t) => {
  const { root, assets } = await makeCleanBundle();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { status, stdout } = runScanner(assets);
  assert.equal(status, 0, `expected 0, got ${status}\nstdout: ${stdout}`);
  assert.match(stdout, /no surviving console\.\* calls/);
});

test('dirty bundle: scanner exits 1 and reports the offending file', async (t) => {
  const { root, assets } = await makeDirtyBundle();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { status, stdout, stderr } = runScanner(assets);
  assert.equal(status, 1, `expected 1, got ${status}\nstdout: ${stdout}\nstderr: ${stderr}`);
  // Both the summary line and the file path must appear — the operator
    // needs to be able to act on the failure without re-running with
    // extra flags.
  assert.match(stderr + stdout, /FAIL/);
  assert.match(stderr + stdout, /login\.js/);
  assert.match(stderr + stdout, /console\.log/);
});

test('missing directory: scanner exits 2 with an actionable message', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'console-guard-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { root: missingAssets } = { root: join(root, 'does', 'not', 'exist') };
  const { status, stderr } = runScanner(missingAssets);
  assert.equal(status, 2);
  assert.match(stderr, /output directory does not exist/);
  assert.match(stderr, /--out-dir/);
});

test('empty assets dir: scanner exits 2 (not a silent 0)', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'console-guard-empty-'));
  const assets = join(root, 'assets');
  await mkdir(assets, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  const { status, stderr } = runScanner(assets);
  // Distinct from the "missing directory" failure: the dir exists but is
    // empty, which usually means the build crashed or produced output
    // elsewhere.
  assert.equal(status, 2);
  assert.match(stderr, /no \.js files found/);
});

// Reference: ensure the script lives next to package.json so the npm
// script path resolves correctly. This catches a refactor that moves
// the script out of `scripts/` without updating package.json.
test('script lives at frontend/scripts/check-no-console-in-build.mjs', () => {
  assert.ok(
    scriptPath.endsWith(join('frontend', 'scripts', 'check-no-console-in-build.mjs')),
    `expected ${scriptPath} to be under frontend/scripts/`
  );
});

// Sanity: confirm `npm run build:check-console` is wired up to the
// script via package.json. A future refactor that moves the script
// must update package.json to match, or this test fails.
test('package.json exposes build:check-console wired to the script', async () => {
  const pkgPath = join(frontendRoot, 'package.json');
  const pkgRaw = await (await import('node:fs/promises')).readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  assert.equal(
    pkg.scripts['build:check-console'],
    'node scripts/check-no-console-in-build.mjs',
    'build:check-console must invoke scripts/check-no-console-in-build.mjs'
  );
  assert.ok(
    pkg.scripts['build:verify'],
    'build:verify must exist (build + check-console) so CI has a single entrypoint'
  );
  assert.match(pkg.scripts['build:verify'], /npm run build/);
  assert.match(pkg.scripts['build:verify'], /build:check-console/);
});