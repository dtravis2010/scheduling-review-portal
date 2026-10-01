// Proves the default (sample) build cannot reach live Firestore: it builds the
// site into a temp folder and checks that no Firebase code or config is in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const build = (env) => {
  const outDir = mkdtempSync(join(tmpdir(), 'portal-build-'));
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
  const assets = join(outDir, 'assets');
  const code = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(assets, f), 'utf8'))
    .join('\n');
  rmSync(outDir, { recursive: true, force: true });
  return code;
};

const FIREBASE_MARKERS = ['scheduling-review.firebaseapp.com', 'firestore.googleapis.com'];

test('sample build contains no Firebase code or config', () => {
  const code = build({ VITE_DATA_MODE: '' });
  for (const marker of FIREBASE_MARKERS) assert.ok(!code.includes(marker), `found ${marker}`);
});

test('live build still includes the Edit / Review tools', () => {
  const code = build({ VITE_DATA_MODE: 'live' });
  assert.ok(code.includes('scheduling-review.firebaseapp.com'));
});
