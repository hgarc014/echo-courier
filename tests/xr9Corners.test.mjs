// XR-9 (W5-BOSS): no corner is a safe place to idle. A courier that walks into any
// corner and waits must be caught by the telegraphed perimeter sweep.
// Run: node tests/xr9Corners.test.mjs
import assert from 'node:assert/strict';
import { loadLevel, main, state, keys } from './harness/replay.mjs';
import { LEVELS } from '../src/data/levels.js';

const BOSS = LEVELS.findIndex(l => String(l.name).startsWith('W5-BOSS'));
let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.message}`); }
}
function press(dirs) { for (const k of Object.keys(keys)) keys[k] = false; for (const d of dirs) keys[d] = true; }
/** Hold each key until the courier stops moving, then idle for one full loop. */
function idleInCorner(path) {
    loadLevel({ level: BOSS });
    for (const k of path) {
        press([k]);
        let last = null; let still = 0;
        for (let i = 0; i < 1200 && state.gameState === 'PLAYING' && still < 5; i++) {
            main.stepSimulation();
            const pos = `${state.player.x},${state.player.y}`;
            still = pos === last ? still + 1 : 0; last = pos;
        }
    }
    press([]);
    const at = { x: Math.round(state.player.x), y: Math.round(state.player.y) };
    let fail = '';
    for (let i = 0; i < 40 * 60 && state.gameState === 'PLAYING' && !fail; i++) {
        main.stepSimulation();
        fail = state.failMessage || '';
    }
    return { at, gameState: state.gameState, fail };
}

const corners = {
    'north-west (spawn)': [],
    'north-east': ['d'],
    'south-west': ['s'],
    'south-east (outside the vault door)': ['s', 'd']
};
for (const [name, path] of Object.entries(corners)) {
    check(`idling in the ${name} corner fails`, () => {
        const r = idleInCorner(path);
        assert.notEqual(r.gameState, 'LEVEL_COMPLETE');
        assert.match(r.fail, /perimeter sweep/i, `survived a full loop at ${JSON.stringify(r.at)} (${r.gameState})`);
        console.log(`       at ${JSON.stringify(r.at)}: ${r.fail}`);
    });
}

check('sweep is telegraphed for 1.5-2s before it fires', () => {
    loadLevel({ level: BOSS });
    const r = state.robots[0];
    assert.ok(r.sweepPeriod != null, 'XR-9 has a sweep');
    const tele = r.sweepTelegraphTicks();
    assert.ok(tele >= 90 && tele <= 120, `telegraph ${tele} ticks`);
    const p = r.sweepPeriodTicks();
    assert.equal(r.sweepPhase(p - tele - 1).phase, 'idle');
    assert.equal(r.sweepPhase(p - tele).phase, 'warn');
    assert.equal(r.sweepPhase(p).phase, 'fire');
});

check('sweep lanes stop at walls (the vault door blocks the south lane)', () => {
    loadLevel({ level: BOSS });
    const lanes = state.robots[0].sweepLanes();
    const fromSW = lanes[2];
    assert.ok(fromSW.x + fromSW.w <= 604, `south lane from the SW corner ends at ${fromSW.x + fromSW.w}`);
    const fromNE = lanes[6];
    assert.ok(fromNE.y + fromNE.h <= 464, `east lane from the NE corner ends at ${fromNE.y + fromNE.h}`);
});

if (failures) { console.log(`${failures} XR-9 corner check(s) failed`); process.exit(1); }
console.log('all XR-9 corner checks passed');
