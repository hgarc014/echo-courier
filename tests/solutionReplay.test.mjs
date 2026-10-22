// Solution-replay CI: every tests/solutions/*.json must still complete its level
// (and meet par when the level defines one). See tests/solutions/README.md.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution, loadLevel, main, state, keys } from './harness/replay.mjs';
import { runNaive as runNaiveW1 } from './harness/recordW1.mjs';
import { LEVELS, getLevelSetup, serializeLevel } from '../src/data/levels.js';
import { findEchoesEndingOnCracks } from '../src/validation/echoValidation.js';
import { runNaive as runNaiveW4 } from './harness/recordW4.mjs';
import { runNaive as runNaiveW5, dashRushL3, runQaPlan, QA_XR9_PLANS } from './harness/recordW5.mjs';

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
        if (String(sol.levelName || '').startsWith('W2-') || String(sol.levelName || '').startsWith('W4-') || String(sol.levelName || '').startsWith('W5-')) {
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

const w1Files = ['w1-l1.json', 'w1-l2.json', 'w1-l3.json', 'w1-l4.json', 'w1-mb.json'];
for (const f of w1Files) {
    check(`truncated ${f} fails`, () => {
        const sol = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        const r = replaySolution({ ...sol, loops: sol.loops.slice(0, -1) }, { extraTicks: 90 });
        assert.equal(r.completed, false, 'dropping the last loop still completed');
    });
}

const w4Files = ['w4-l1.json', 'w4-l2.json', 'w4-l3.json', 'w4-l4.json', 'w4-mb.json'];
for (const f of w4Files) {
    check(`truncated ${f} fails`, () => {
        const sol = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        const r = replaySolution({ ...sol, loops: sol.loops.slice(0, -1) }, { extraTicks: 90 });
        assert.equal(r.completed, false, 'dropping the last loop still completed');
    });
}

for (const plan of ['l1-grab-first', 'l2-one-plate', 'l3-no-shield', 'l4-crack-park', 'mb-no-shield']) {
    check(`naive ${plan} fails`, () => {
        const r = runNaiveW4(plan);
        assert.equal(r.completed, false, `${plan} completed (${r.fail || 'no fail'})`);
    });
}

for (const f of ['w5-l1.json', 'w5-l2.json', 'w5-l3.json', 'w5-l4.json', 'w5-boss.json']) {
    check(`truncated ${f} fails`, () => {
        const sol = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        const r = replaySolution({ ...sol, loops: sol.loops.slice(0, -1) }, { extraTicks: 90 });
        assert.equal(r.completed, false, 'dropping the last loop still completed');
    });
}

for (const plan of ['l1-plain-first', 'l1-one-echo', 'l2-blue-first', 'l3-direct', 'l3-park', 'l4-no-decoy', 'l4-sneak', 'l4-blue-middle', 'l4-decoy-first', 'l4-ignore-static', 'l4-miss-window', 'x9-frontal', 'x9-early-blue', 'x9-wrong-order', 'x9-camp', 'x9-triple', 'x9-qa-cheese', 'x9-qa-front-walk']) {
    check(`naive W5 ${plan} fails`, () => {
        const r = runNaiveW5(plan);
        assert.equal(r.completed, false, `${plan} completed (${r.fail || 'no fail'})`);
    });
}

// QA B r2 (N1): carrying the parcel into the L4 beam is a visible, counted loop fail.
check('W5 N1: walking the parcel into the L4 beam fails the loop with a message', () => {
    loadLevel({ level: LEVELS.findIndex(l => l.name.startsWith('W5-L4')) });
    const step = (k = []) => { for (const x of ['w', 'a', 's', 'd', 'space', 'r', 'shift']) keys[x] = false; for (const x of k) keys[x] = true; main.stepSimulation(); };
    const pkg = state.packages[0];
    for (let i = 0; i < 400 && (Math.abs(pkg.x - state.player.x) > 3 || Math.abs(pkg.y - state.player.y) > 3); i++) {
        const dx = pkg.x - state.player.x, dy = pkg.y - state.player.y;
        step([Math.abs(dy) > 3 ? (dy > 0 ? 's' : 'w') : (dx > 0 ? 'd' : 'a')]);
    }
    step(['space']); step();
    assert.equal(pkg.carriedBy, 'player');
    let msg = '';
    for (let i = 0; i < 200 && !msg; i++) { step(['d']); msg = state.failMessage; }
    assert.match(msg, /Laser|Package/, 'no fail message when the parcel hit the beam');
    assert.equal(state.loopFails, 1, 'loop fail not counted');
    const runs = state.pastRuns.length;
    for (let i = 0; i < 200 && state.failTimer > 0; i++) step();
    assert.equal(state.pastRuns.length, runs, 'the burned run must not become an echo');
});

// QA B r2 (B6): a west dash at the closed back door used last tick's (south) facing.
check('W5 B6: dashing west into XR-9\'s closed back door never jumps the courier south', () => {
    loadLevel({ level: LEVELS.findIndex(l => l.name.startsWith('W5-BOSS')) });
    let last = null; const jumps = [];
    runQaPlan(QA_XR9_PLANS['k-d-east-door-dash'], () => {
        const p = state.player;
        if (last && state.currentTick > 0 && Math.abs(p.y - last.y) > 20) jumps.push([state.currentTick, Math.round(last.y), Math.round(p.y)]);
        last = { x: p.x, y: p.y };
    });
    assert.deepEqual(jumps, [], `vertical jumps during a west dash: ${JSON.stringify(jumps)}`);
});

// QA B (B1): dash through XR-9's body into the back arc, then sit on the panel.
check('W5 x9-qa-cheese: no dash-through, at most one panel hit per loop', () => {
    const r = runNaiveW5('x9-qa-cheese');
    assert.equal(r.completed, false);
    assert.ok(r.hp >= 2, `QA cheese took XR-9 to hp ${r.hp} in 2 loops`);
});
check('W5 x9-triple: one panel hit per loop', () => {
    const r = runNaiveW5('x9-triple');
    assert.ok(r.hp >= 2, `triple route left hp ${r.hp}`);
});

check('W5 l4-ignore-static fails only because of static: the same inputs complete with the static removed', () => {
    const r = runNaiveW5('l4-ignore-static', { noStatic: true });
    assert.equal(r.completed, true, `no-static control failed (${r.fail || 'no fail'})`);
});

for (const plan of ['l2-control', 'l3-control', 'l4-control']) {
    check(`W5 ${plan}: the naive haul completes when the echoes are right`, () => {
        const r = runNaiveW5(plan);
        assert.equal(r.completed, true, 'control haul failed, so the naive checks prove nothing');
    });
}

check('W5-L3 gate is shut before even a dashing courier gets the parcel there', () => {
    const r = dashRushL3();
    assert.ok(r.dashes > 0, 'dash never fired');
    assert.equal(r.gateOpen, false, `gate still open at tick ${r.tick}`);
});

check('truncated w2-l1 solution fails', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'w2-l1.json'), 'utf8'));
    const cut = [sol.loops[0].slice(0, 1).map(([k, n]) => [k, Math.min(n, 5)])];
    const r = replaySolution({ ...sol, loops: cut }, { extraTicks: 30 });
    assert.equal(r.completed, false);
});

for (const plan of ['l2-fetch-first', 'l3-leave-plate', 'l3-first-window', 'l4-two-loops', 'mb-park-early', 'mb-rush-vault']) {
    check(`naive ${plan} fails`, () => {
        const r = runNaiveW1(plan);
        if (plan === 'l2-fetch-first') {
            const withinPar = r.completed && (r.par == null || r.loops <= r.par);
            assert.equal(withinPar, false, `${plan} completed within par (${r.loops} loops, par ${r.par})`);
            return;
        }
        assert.equal(r.completed, false, `${plan} completed`);
    });
}

// Editor playtest path: W1-L1 inputs against that level's layout loaded from the editor.
check('w1-l1 inputs replay via editor-playtest path', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'w1-l1.json'), 'utf8'));
    const setup = getLevelSetup(LEVELS.findIndex(level => level.name === 'First Shift'));
    const layout = serializeLevel({ ...setup, width: setup.mapWidth, height: setup.mapHeight, meta: {} });
    const r = replaySolution({
        level: null,
        layout,
        meta: { name: 'First Shift via editor', maxGhosts: 1, loopTime: 20, grants: [] },
        loops: sol.loops
    });
    assert.ok(r.completed, `editor playtest replay did not complete; fails: ${r.failMessages.join(' | ') || 'none'}`);
});

function releaseKeys() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function tap(frameKey) {
    releaseKeys();
    if (frameKey) for (const part of frameKey.split('+')) keys[part] = true;
    main.stepSimulation();
}

function loopCapTicks() {
    const seconds = Number(state.currentLevelMeta?.loopTime);
    const tps = state.TICK_RATE > 0 ? (1000 / state.TICK_RATE) : 60;
    return Math.round(seconds * tps);
}

function holdRestOfLoop1() {
    const cap = loopCapTicks();
    let steps = 0;
    while (state.gameState === 'PLAYING' && state.loopNumber === 1 && state.pastRuns.length === 0 && state.currentTick < cap && steps < cap + 5) {
        tap('');
        steps++;
    }
    return cap;
}

// Sinkhole's recorded route, stopped after loop 1 (no rewind, no later loops).
check('w2-mb one-loop attempt does not clear', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'w2-mb.json'), 'utf8'));
    const first = sol.loops[0].filter(([k]) => k !== 'r');
    const r = replaySolution({ ...sol, loops: [first] }, { extraTicks: 0 });
    assert.equal(r.completed, false);
    assert.equal(r.loopsUsed, 1);
    assert.equal(state.pastRuns.length, 0);
    const cap = holdRestOfLoop1();
    assert.notEqual(state.gameState, 'LEVEL_COMPLETE');
    assert.equal(state.loopNumber, 1);
    assert.equal(state.pastRuns.length, 0);
    assert.equal(state.currentTick, cap);
    const boss = state.burrowers[0];
    assert.equal(boss.defeated, false);
    assert.ok(boss.hp > 0, `boss died in one loop (hp ${boss.hp})`);
    const door = state.doors.find(d => d.id === boss.defeatDoorId);
    assert.equal(door.isOpen, false);
});

// Camp one core plate for the whole loop. Several burrower cycles fit in that
// loop; with no echoes the boss may stun once and then stays dormant.
check('w2-mb idle on one core plate does not solo loop 1', () => {
    const sol = JSON.parse(readFileSync(join(dir, 'w2-mb.json'), 'utf8'));
    loadLevel(sol);
    const plate = state.plates.find(p => p.id === 'c3');
    assert.ok(plate, 'core plate c3 missing');
    const parked = () => {
        const p = state.player;
        return p.x >= plate.x && p.y >= plate.y && p.x + p.w <= plate.x + plate.w && p.y + p.h <= plate.y + plate.h;
    };
    for (let i = 0; i < 500 && !parked(); i++) {
        const p = state.player;
        const underSep = p.x < 360 && p.y + p.h > 400;
        let frame = '';
        if (underSep) frame = 'd';
        else {
            const dx = (plate.x + 5) - p.x;
            const dy = (plate.y + 5) - p.y;
            if (dy < -1) frame += 'w';
            else if (dy > 1) frame += 's';
            if (dx > 1) frame += (frame ? '+' : '') + 'd';
            else if (dx < -1) frame += (frame ? '+' : '') + 'a';
        }
        tap(frame);
        assert.equal(state.loopNumber, 1);
        assert.equal(state.pastRuns.length, 0);
        assert.notEqual(state.gameState, 'LEVEL_COMPLETE');
    }
    assert.equal(parked(), true, `did not park on c3 (player ${state.player.x},${state.player.y})`);
    const boss = state.burrowers[0];
    const cap = holdRestOfLoop1();
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.loopNumber, 1);
    assert.equal(state.pastRuns.length, 0);
    assert.equal(state.activeGhosts.length, 0);
    assert.equal(state.currentTick, cap);
    assert.ok(cap >= boss.intervalTicks() * 3, 'loop did not cover several surface cycles');
    assert.equal(boss.hp, boss.maxHp - 1);
    assert.equal(boss.stunsThisLoop, 1);
    assert.equal(boss.phase, 'dormant');
    assert.equal(boss.defeated, false);
    assert.equal(boss.maxStunsPerLoop, 1);
    const door = state.doors.find(d => d.id === boss.defeatDoorId);
    assert.equal(door.isOpen, false);
    assert.equal(parked(), true);
});

process.exit(failures ? 1 : 0);
