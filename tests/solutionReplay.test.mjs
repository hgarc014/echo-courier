// Solution-replay CI: every tests/solutions/*.json must still complete its level
// (and meet par when the level defines one). See tests/solutions/README.md.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution } from './harness/replay.mjs';
import { getLevelSetup, serializeLevel } from '../src/data/levels.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'solutions');
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
assert.ok(files.length > 0, 'no recorded solutions found');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

for (const f of files) {
    const sol = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    check(`${f} (${sol.levelName ?? 'level ' + sol.level})`, () => {
        assert.equal(sol.format, 'echo-courier-solution/v1', 'unknown solution format');
        const r = replaySolution(sol);
        assert.ok(r.completed, `level not completed after ${r.ticks} ticks, ${r.loopsUsed} loops; fails: ${r.failMessages.join(' | ') || 'none'}`);
        if (r.par != null) assert.ok(r.loopsUsed <= r.par, `over par: ${r.loopsUsed} loops > par ${r.par}`);
        if (sol.completedLoops != null) assert.equal(r.loopsUsed, sol.completedLoops, 'loop count drifted from recording');
        console.log(`       completed in ${r.loopsUsed} loop(s), ${r.ticks} ticks${r.par != null ? `, par ${r.par}` : ''}`);
    });
}

// Harness sanity: a truncated solution must NOT complete, so passing means something.
check('truncated level01 solution fails', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'level01.json'), 'utf8'));
    const r = replaySolution({ ...sol, loops: sol.loops.slice(0, 1) }, { extraTicks: 60 });
    assert.equal(r.completed, false);
});

// Editor playtest path: the same inputs replayed against Level 1's layout loaded as an editor level.
check('level01 inputs replay via editor-playtest path', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'level01.json'), 'utf8'));
    const setup = getLevelSetup(0);
    const layout = serializeLevel({ ...setup, width: setup.mapWidth, height: setup.mapHeight, meta: {} });
    const r = replaySolution({ level: null, layout, meta: { name: 'L1 via editor', maxGhosts: 1, grants: [] }, loops: sol.loops });
    assert.ok(r.completed, `editor playtest replay did not complete; fails: ${r.failMessages.join(' | ') || 'none'}`);
});

process.exit(failures ? 1 : 0);
