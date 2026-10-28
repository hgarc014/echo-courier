// Scripted solution for a generated floor (src/data/floorGen.js). Drives the real sim
// through the editor-playtest path, so the export is an editor-style solution
// (level: null, layout + meta). Modeled on recordW5.mjs.
// Usage: node tests/harness/recordFloor.mjs <seed> [roomCount] [out.json]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main, state, keys, loadLevel, runCleared } from './replay.mjs';
import { displayedLoopNumber } from '../../src/core/loopDisplay.js';
import { generateFloor, LANE_Y } from '../../src/data/floorGen.js';

function tick(dir = {}, extra = [], soft = false) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r', 'shift']) keys[k] = false;
    if (dir.x > 0) keys.d = true;
    if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true;
    if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    main.stepSimulation();
    if (!soft && state.failMessage) throw new Error(`failed: ${state.failMessage} tick ${state.currentTick}`);
}

// Axis-aligned walk; returns false (soft) or throws when blocked.
function moveTo(x, y, { tol = 2, max = 1500, soft = false } = {}) {
    let stuck = 0;
    for (let i = 0; i < max; i++) {
        if (runCleared()) return true;
        const dx = x - state.player.x, dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return true;
        const sx = Math.abs(dx) > tol ? Math.sign(dx) : 0;
        const sy = sx === 0 && Math.abs(dy) > tol ? Math.sign(dy) : 0;
        const px = state.player.x, py = state.player.y;
        const frozen = state.rewindFreeze > 0 || state.gameState !== 'PLAYING';
        tick({ x: sx, y: sy }, [], soft);
        if (runCleared()) return true;
        if (frozen) continue;
        if (state.player.x === px && state.player.y === py) {
            if (++stuck > 8) {
                if (soft) return false;
                throw new Error(`moveTo(${x},${y}) blocked at ${Math.round(px)},${Math.round(py)} tick ${state.currentTick}`);
            }
        } else stuck = 0;
    }
    if (soft) return false;
    throw new Error(`moveTo(${x},${y}) timed out`);
}

function wait(n) { for (let i = 0; i < n && !runCleared(); i++) tick(); }
function pressR() { tick({}, ['r']); }
const doorOpen = id => !!state.doors.find(d => d.id === id)?.isOpen;

function waitUntil(pred, max, label) {
    for (let i = 0; i < max; i++) { if (pred()) return; tick(); }
    throw new Error(`${label} timed out at tick ${state.currentTick}`);
}

// Walk the lane east to x, passing plain doors (their plates sit under the doorway).
function laneTo(x, opts) {
    if (Math.abs(state.player.y - LANE_Y) > 2) moveTo(state.player.x, LANE_Y, opts);
    return moveTo(x, LANE_Y, opts);
}

function holdPlate(plate) {
    laneTo(plate.x + 5);
    moveTo(plate.x + 5, plate.y + 5);
    wait(4);
    pressR();
}

function deliver(info, layout, soft = false) {
    const a = info.airlock;
    if (!laneTo(a.gapX - 34, { soft })) return;
    if (!soft) waitUntil(() => a.doors.every(doorOpen), 600, 'airlock');
    const z = layout.deliveryZone;
    if (!laneTo(z.x + 20, { soft })) return;
    moveTo(z.x + 20, z.y + 40, { soft });
    for (let i = 0; i < 10 && !runCleared(); i++) tick({}, [], soft);
}

export function floorSolution(seed, roomCount) {
    const { layout, meta } = generateFloor(seed, roomCount);
    return { format: 'echo-courier-solution/v1', level: null, levelName: meta.name, layout, meta };
}

export function recordFloor(seed, roomCount, outPath) {
    const { layout, meta, info } = generateFloor(seed, roomCount);
    loadLevel({ layout, meta });
    holdPlate(info.airlock.top);
    holdPlate(info.airlock.bottom);
    deliver(info, layout);
    if (!runCleared()) throw new Error(`floor ${seed} not complete: ${state.gameState} ${state.failMessage || ''}`);
    const sol = JSON.parse(main.exportSolution());
    // Run Over (zone clear) is not LEVEL_COMPLETE, so the exporter leaves this unset.
    if (sol.completedLoops == null) sol.completedLoops = displayedLoopNumber(state.loopNumber);
    if (sol.completedLoops > meta.par) throw new Error(`over par ${sol.completedLoops}`);
    const text = JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
    if (outPath) writeFileSync(outPath, text);
    console.error(`recorded floor ${seed}: ${info.roomCount} rooms, echo room ${info.echoRoom}, ${sol.completedLoops} loops`);
    return sol;
}

// Naive: one courier, no package. Walk east into the exit. Solo and one-echo must not clear the airlock.
export function runNaiveFloor(seed, roomCount, plan = 'solo') {
    const { layout, meta, info } = generateFloor(seed, roomCount);
    loadLevel({ layout, meta });
    if (plan === 'one-echo') holdPlate(info.airlock.top);
    deliver(info, layout, true);
    for (let i = 0; i < 300 && state.gameState === 'PLAYING'; i++) tick({}, [], true);
    return { completed: runCleared(), fail: state.failMessage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [seed = '1', rc, out] = process.argv.slice(2);
    recordFloor(Number(seed), rc && rc !== '-' ? Number(rc) : undefined, out);
}
