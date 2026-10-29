import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const kind = process.argv[2];
if (!['patch', 'minor', 'major'].includes(kind)) {
    console.error('usage: node scripts/bump-version.mjs <patch|minor|major>');
    process.exit(1);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const match = String(pkg.version || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) throw new Error(`package.json version is not semver: ${pkg.version}`);
let [, major, minor, patch] = match.map(Number);
if (kind === 'major') { major++; minor = 0; patch = 0; }
else if (kind === 'minor') { minor++; patch = 0; }
else patch++;
const version = `${major}.${minor}.${patch}`;

pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');

const stamped = spawnSync(process.execPath, ['scripts/stamp-build.mjs'], { stdio: 'inherit' });
if (stamped.status !== 0) process.exit(stamped.status || 1);
console.log(`release version bumped to v${version}`);
