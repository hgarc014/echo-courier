// Every recorded solution names a real level, its recorded index agrees with that
// name, and it replay-clears when resolved by name. Level Select shows no stray
// "Level N" placeholders, sandbox, tutorial, or hidden entries.
// Run: node tests/solutionIndex.test.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution, levelIndexForSolution, LEVELS } from './harness/replay.mjs';
const { levelSelectEntries, WORLDS } = await import('../src/data/levels.js');

const dir = join(dirname(fileURLToPath(import.meta.url)), 'solutions');
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
for (const f of files) {
    const sol = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (sol.layout) continue;
    assert.ok(sol.levelName, `${f}: campaign solution must carry levelName`);
    const idx = LEVELS.findIndex(l => l.name === sol.levelName);
    assert.ok(idx >= 0, `${f}: levelName "${sol.levelName}" matches no level`);
    assert.equal(sol.level, idx, `${f}: level ${sol.level} is "${LEVELS[sol.level]?.name}", not "${sol.levelName}"`);
    assert.equal(levelIndexForSolution(sol), idx);
    // A stale index alone must not decide: replay resolves by name.
    const r = replaySolution({ ...sol, level: (idx + 7) % LEVELS.length });
    assert.ok(r.completed, `${f}: does not replay-clear by name`);
}
assert.throws(() => levelIndexForSolution({ level: 0, levelName: 'No Such Level' }), /matches no level/);

const entries = levelSelectEntries();
const rows = entries.filter(e => e.type === 'level');
for (const { lvl, idx } of rows) {
    assert.ok(!lvl.hideFromSelect && !lvl.isSandbox && !lvl.isTutorial, `stray entry ${idx} ${lvl.name}`);
    assert.ok(WORLDS.some(w => w.levels.includes(idx)) || lvl.isPendingCampaign, `entry ${idx} ${lvl.name} belongs to no world`);
}
const names = rows.map(e => e.lvl.name);
for (const stray of ['Dev Sandbox', 'Level 9: Fragile Grid', 'Level 10: Fast Shipping', 'Level 11: Time Dilation', 'Level 12: Danger Courier']) {
    assert.equal(names.includes(stray), false, `${stray} must not be in Level Select`);
}
assert.equal(new Set(rows.map(e => e.idx)).size, rows.length, 'no duplicate entries');
// Every world header has at least one row under it.
entries.forEach((e, i) => { if (e.type === 'world') assert.equal(entries[i + 1]?.type, 'level', `empty header World ${e.world.id}`); });
console.log(`solution index: ${files.length} solutions resolve by name and clear; ${rows.length} clean Level Select rows`);
