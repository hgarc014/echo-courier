// Scripted 'Loudest wins' Sinkhole (W2-MB) solution. Drives the real sim and writes
// tests/solutions/w2-mb.json via the same exporter as the in-game dev export.
// Usage: node tests/harness/recordW2MB.mjs [out.json]
//
// Route (par 4, max 3 echoes):
//   Loop 1  STAMPER: wait west of crack 440,280 (left of core plate c3), step onto it
//           in the last half-second before the first strike (tick 240), step off.
//   Loop 2  HOLD c3 (enter through its south crack). Echo 1 stamps -> stun 1.
//   Loop 3  same -> stun 2.
//   Loop 4  grab the parcel, HOLD c3 -> stun 3, door opens; leave over the east crack,
//           through the door, drop on the pad.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel, LEVELS } from './replay.mjs';

const levelIdx = () => LEVELS.findIndex(l => l.name === 'W2-MB: Sinkhole');

function tick(dir = {}, extra = []) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r', 'shift', 'f', 'c']) keys[k] = false;
    if (dir.x > 0) keys.d = true;
    if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true;
    if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    main.stepSimulation();
    const b1 = state.burrowers?.[0]; const ph2 = b1 && b1.phase + (b1.playerMode ? 'P' : '') + JSON.stringify(b1.lockedTile);
    if (state.failMessage) throw new Error(`failed: ${state.failMessage} at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loop ${state.pastRuns.length + 1}`);
}
function moveTo(x, y, tol = 2, max = 600) {
    for (let i = 0; i < max; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        const dx = x - state.player.x, dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;
        const sx = Math.abs(dx) > tol ? Math.sign(dx) : 0;
        const sy = sx === 0 && Math.abs(dy) > tol ? Math.sign(dy) : 0;
        tick({ x: sx, y: sy });
    }
    throw new Error(`moveTo(${x},${y}) stuck at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick}`);
}
function waitUntilTick(t) { while (state.currentTick < t) tick(); }
function pressR() { tick({}, ['r']); for (let i = 0; i < 40 && state.rewindFreeze > 0; i++) tick(); }
const hp = () => state.burrowers[0].hp;

const log = (...a) => { if (process.env.MBDEBUG) console.error(...a); };

// Live courier: stay off the frozen player-mode tile for the 240 strike, then
// go up through c3's south crack only after the 241 lock (so the echo is still
// the loudest), and hold c3 through the 481 strike.
function holdC3() {
    moveTo(530, 450);
    waitUntilTick(230);
    moveTo(485, 450);
    moveTo(485, 285);
    waitUntilTick(490);
}

export function solve() {
    loadLevel({ level: levelIdx() });
    // Loop 1: the stamper. Pass over c3's west crack (noise ~213, inside the 1.5 s
    // before the 241 lock), stand north of the plate so the nearest crack at lock
    // is c3's north crack, then step onto it ~20 ticks before the 481 strike and
    // stay ON it through the strike. Step back off before it breaks.
    moveTo(445, 450);
    waitUntilTick(180);
    moveTo(445, 215);
    waitUntilTick(458);
    moveTo(470, 215);
    waitUntilTick(486);
    moveTo(445, 215);
    waitUntilTick(510);
    log('loop1 done hp', hp());
    pressR();
    // Loops 2-4: hold c3 while echo 1 stamps (one stun per loop).
    for (let n = 1; n <= 3; n++) {
        if (n === 3) {
            moveTo(335, 455);
            tick({}, ['space']); tick();
            if (!state.packages.some(p => p.carriedBy === 'player')) throw new Error('grab failed');
        }
        holdC3();
        log(`loop ${n + 1} hp`, hp(), state.burrowers[0].feedback?.text);
        if (hp() !== 3 - n) throw new Error(`loop ${n + 1}: expected hp ${3 - n}, got ${hp()}`);
        if (n < 3) pressR();
    }
    moveTo(525, 285);
    moveTo(525, 470);
    const z = state.deliveryZone;
    moveTo(z.x + 20, 470);
    tick({}, ['space']);
    for (let i = 0; i < 10 && state.gameState !== 'LEVEL_COMPLETE'; i++) tick();
    if (state.gameState !== 'LEVEL_COMPLETE') throw new Error('not delivered: ' + state.gameState);
    return JSON.parse(main.exportSolution());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const sol = solve();
    const text = JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
    const out = process.argv[2] || new URL('../solutions/w2-mb.json', import.meta.url).pathname;
    writeFileSync(out, text);
    console.error(`recorded ${sol.levelName}: ${sol.loops.length} loops, completed in ${sol.completedLoops}`);
}
