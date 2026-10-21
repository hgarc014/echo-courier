// Solution-replay CI: every tests/solutions/*.json must still complete its level
// (and meet par when the level defines one). See tests/solutions/README.md.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution, state } from './harness/replay.mjs';
import { getLevelSetup, serializeLevel } from '../src/data/levels.js';
import { findEchoesEndingOnCracks } from '../src/validation/echoValidation.js';

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
        if (String(sol.levelName || '').startsWith('W2-')) {
            const ends = (state.pastRuns || []).map((run, id) => {
                const step = run && run.length ? run[run.length - 1] : {};
                return { id, x: step.x, y: step.y, w: 30, h: 30 };
            });
            const offenders = findEchoesEndingOnCracks({ cracks: state.cracks }, ends);
            assert.equal(offenders.length, 0, `echo ends on a crack: ${JSON.stringify(offenders)}`);
        }
        console.log(`       completed in ${r.loopsUsed} loop(s), ${r.ticks} ticks${r.par != null ? `, par ${r.par}` : ''}`);
    });
}

// Harness sanity: a truncated solution must NOT complete, so passing means something.
check('truncated level01 solution fails', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'level01.json'), 'utf8'));
    const r = replaySolution({ ...sol, loops: sol.loops.slice(0, 1) }, { extraTicks: 60 });
    assert.equal(r.completed, false);
});

check('truncated w2-l1 solution fails', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'w2-l1.json'), 'utf8'));
    const cut = [sol.loops[0].slice(0, 1).map(([k, n]) => [k, Math.min(n, 5)])];
    const r = replaySolution({ ...sol, loops: cut }, { extraTicks: 30 });
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
