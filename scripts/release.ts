import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command: string, args: string[], capture = false): string {
  const result = spawnSync(command, args, { cwd: resolve(import.meta.dir, '..'), stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})${capture ? `\n${result.stderr}` : ''}`);
  return result.stdout ?? '';
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(`bun@${Bun.version}`, pkg.packageManager, 'Use the pinned Bun version');
run('bun', ['install', '--frozen-lockfile']);
run('bun', ['run', 'verify']);
run('bun', ['run', 'samples']);
run('bun', ['scripts/verify-pdf.ts']);
run('bun', ['run', 'smoke']);
const artifact = `${pkg.name}-${pkg.version}.vsix`;
run('bun', ['node_modules/@vscode/vsce/vsce', 'package', '--no-dependencies', '--no-gitHubIssueLinking', '--no-gitLabIssueLinking', '--out', artifact]);
const files = run('unzip', ['-Z1', artifact], true).trim().split('\n');
for (const file of ['dist/extension.js', 'dist/data/Courier.afm', 'dist/data/Courier-Bold.afm', 'dist/data/Courier-Oblique.afm', 'THIRD-PARTY-NOTICES.md', 'samples/coffee.pdf', 'samples/coffee.fountain', 'samples/coffee.breakdown.md', 'samples/coffee.breakdown.csv', 'samples/coffee.schedule.md']) {
  assert.ok(files.includes(`extension/${file}`), `Missing ${file}`);
}
assert.ok(!files.some(file => /^extension\/(?:node_modules|src|test|scripts|docs|\.vscode)\//.test(file) || /(?:\.map|\.lock|\.vsix)$/.test(file) || file === 'extension/budget.md'), 'Unexpected tooling or local data in artifact');
const notices = run('unzip', ['-p', artifact, 'extension/THIRD-PARTY-NOTICES.md'], true);
assert.ok(notices.includes('Copyright 2013 Google Inc.'));
assert.ok(notices.includes('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION'));
const packaged = JSON.parse(run('unzip', ['-p', artifact, 'extension/package.json'], true));
assert.equal(packaged.version, pkg.version);
assert.equal(packaged.scripts['vscode:prepublish'], undefined);
const readme = run('unzip', ['-p', artifact, 'extension/readme.md'], true);
assert.ok(readme.includes('## INT. COFFEE SHOP - DAY #1#'));
assert.ok(readme.includes('trailing `#4A#`'));
assert.ok(!readme.includes('/issues/1'));
assert.ok(readme.includes(`screen-mark-${pkg.version}.vsix`));
assert.match(readme, /https:\/\/[^\s"<>]+\/media\/icon.png/);
run('bun', ['scripts/editor-smoke.ts', artifact]);
console.log(`Verified local release: ${resolve(artifact)} (${files.length} archive entries)`);
