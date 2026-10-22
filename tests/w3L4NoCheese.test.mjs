// W3-L4 must need an echo: no 1-loop, echo-free haul (the old north-strip bypass
// or a timed dash past the guard and camera).
// Run: node tests/w3L4NoCheese.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main, state, keys, loadLevel, LEVELS, replaySolution } from './harness/replay.mjs';

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); } catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}
const idx = LEVELS.findIndex(l => l.name.startsWith('W3-L4'));
function tick(dx = 0, dy = 0, extra = []) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r', 'f']) keys[k] = false;
    if (dx > 0) keys.d = true; if (dx < 0) keys.a = true; if (dy > 0) keys.s = true; if (dy < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    main.stepSimulation();
    if (state.failMessage) throw new Error(state.failMessage);
}
function walk(x, y) {
    for (let i = 0; i < 900; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        const dx = x - state.player.x, dy = y - state.player.y;
        if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
        const px = state.player.x, py = state.player.y;
        if (Math.abs(dx) > 3) tick(Math.sign(dx), 0); else tick(0, Math.sign(dy));
        if (px === state.player.x && py === state.player.y && state.rewindFreeze <= 0) throw new Error('blocked');
    }
    throw new Error('timeout');
}
function haulFrom(wx, wy, d) {
    loadLevel({ level: idx });
    try {
        walk(160, 505); tick(0, 0, ['space']); tick();
        walk(wx, wy); for (let i = 0; i < d; i++) tick();
        walk(520, wy < 480 ? wy : 545); walk(520, 495);
        for (let i = 0; i < 400 && !state.doors.find(x => x.id === 'td1').isOpen; i++) tick();
        walk(720, 495); tick(0, 0, ['space']); for (let i = 0; i < 10; i++) tick();
    } catch { return false; }
    return state.gameState === 'LEVEL_COMPLETE' && state.pastRuns.length === 0;
}

check('no echo-free 1-loop haul clears W3-L4 (old layout fails this)', () => {
    const wins = [];
    for (const [wx, wy] of [[100, 300], [160, 300], [290, 330], [160, 420], [290, 420], [420, 420], [520, 420], [300, 545], [100, 545], [165, 545]]) {
        for (let d = 0; d <= 560; d += 8) if (haulFrom(wx, wy, d)) wins.push(`${wx},${wy}+${d}`);
    }
    assert.deepEqual(wins, []);
});

check('recorded W3-L4 needs its echo loop', () => {
    const sol = JSON.parse(readFileSync(new URL('./solutions/w3-l4.json', import.meta.url), 'utf8'));
    assert.ok(sol.loops.length >= 2);
    assert.equal(replaySolution(sol).completed, true);
    const r = replaySolution({ ...sol, loops: sol.loops.slice(-1) }, { extraTicks: 90 });
    assert.equal(r.completed, false, 'live loop alone (no echo) cleared');
});

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('W3-L4 no-cheese checks passed');
