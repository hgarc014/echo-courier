// Stamp prefers STAMP_GIT_SHA, shortened to 7, over GITHUB_SHA and git HEAD.
// Run: node tests/stampBuild.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const infoPath = join(root, 'src', 'buildInfo.js');
const original = readFileSync(infoPath, 'utf8');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function stamp(env) {
    const r = spawnSync(process.execPath, ['scripts/stamp-build.mjs'], {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return readFileSync(infoPath, 'utf8');
}

function field(source, name) {
    const m = source.match(new RegExp(`export const ${name} = "([^"]*)"`));
    assert.ok(m, `${name} export missing`);
    return m[1];
}

try {
    const stamped = stamp({
        STAMP_GIT_SHA: 'deadbeef',
        GITHUB_SHA: '1111111111111111111111111111111111111111',
    });
    assert.equal(field(stamped, 'gitSha'), 'deadbee');
    assert.equal(field(stamped, 'version'), packageVersion);
    assert.match(field(stamped, 'builtAt'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);

    const fromGithub = stamp({
        STAMP_GIT_SHA: '',
        GITHUB_SHA: 'abcdef0123456789abcdef0123456789abcdef01',
    });
    assert.equal(field(fromGithub, 'gitSha'), 'abcdef0');
} finally {
    writeFileSync(infoPath, original);
}
