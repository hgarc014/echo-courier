import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const build = readFileSync('src/buildInfo.js', 'utf8');
const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');

assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.match(build, new RegExp(`export const version = "${pkg.version.replaceAll('.', '\\.')}"`));
assert.match(workflow, /branches:\s*\[main, master\]/);
assert.match(workflow, /npm run release:check/);
assert.match(workflow, /GITHUB_SHA:\s*\$\{\{ github\.sha \}\}/);
assert.match(workflow, /actions\/deploy-pages@v4/);

const check = spawnSync(process.execPath, ['scripts/check-release-version.mjs'], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || check.stdout);

console.log('release version ok');
