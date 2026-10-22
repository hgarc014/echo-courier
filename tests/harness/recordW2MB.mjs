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

function holdC3() {
    moveTo(485, 450);
    moveTo(485, 285);       // up through c3's south crack onto the plate
    waitUntilTick(250);     // first strike at tick 240
}

export function solve() {
    loadLevel({ level: levelIdx() });
    // Loop 1: stamper.
    moveTo(405, 450);
    moveTo(405, 285);
    waitUntilTick(212);
    moveTo(431, 285, 1);    // onto 440,280 (centre inside) inside the stamp window
    waitUntilTick(241);
    moveTo(400, 285);       // off before it falls
    tick();
    pressR();
    // Loops 2 and 3: hold c3 while echo 1 stamps.
    for (let n = 1; n <= 2; n++) {
        holdC3();
        if (hp() !== 3 - n) throw new Error(`loop ${n + 1}: expected hp ${3 - n}, got ${hp()}`);
        pressR();
    }
    // Loop 4: parcel, hold, stun 3, deliver.
    moveTo(335, 455);
    tick({}, ['space']); tick();
    if (!state.packages.some(p => p.carriedBy === 'player')) throw new Error('grab failed');
    holdC3();
    if (hp() !== 0) throw new Error(`loop 4: expected hp 0, got ${hp()}`);
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
