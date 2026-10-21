// Scripted W1 solutions. Drives the real sim (same recorder as a dev export).
// Usage: node tests/harness/recordW1.mjs <levelIndex> [out.json]
//    or: node tests/harness/recordW1.mjs all
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel } from './replay.mjs';

const FILES = {
    0: 'tests/solutions/w1-l1.json',
    1: 'tests/solutions/w1-l2.json',
    2: 'tests/solutions/w1-l3.json',
    3: 'tests/solutions/w1-l4.json',
    4: 'tests/solutions/w1-mb.json'
};

function tick(dir = {}, extra = []) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r']) keys[k] = false;
    if (dir.x > 0) keys.d = true; if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true; if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    main.stepSimulation();
}

function moveTo(x, y, tol = 4, max = 900) {
    let stuck = 0;
    for (let i = 0; i < max; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        const dx = x - state.player.x;
        const dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;
        // Axis-aligned. Diagonal steps are 4/√2 and orbit a target forever.
        let sx = 0, sy = 0;
        if (Math.abs(dx) > tol && (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) <= tol)) sx = Math.sign(dx);
        else if (Math.abs(dy) > tol) sy = Math.sign(dy);
        else return;
        const px = state.player.x;
        const py = state.player.y;
        const frozen = state.rewindFreeze > 0;
        tick({ x: sx, y: sy });
        if (frozen) { stuck = 0; continue; }
        const ndx = x - state.player.x;
        const ndy = y - state.player.y;
        if (Math.abs(ndx) <= tol && Math.abs(ndy) <= tol) return;
        const closer = Math.abs(ndx) + Math.abs(ndy) < Math.abs(dx) + Math.abs(dy) - 0.5;
        const moved = state.player.x !== px || state.player.y !== py;
        if (moved && closer) { stuck = 0; continue; }
        stuck++;
        // A 4px step that overshoots a nearby point is close enough.
        if (Math.abs(dx) <= 4 + tol && Math.abs(dy) <= 4 + tol) return;
        if (stuck > 8) {
            throw new Error(`moveTo(${x},${y}) blocked at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length}`);
        }
    }
    throw new Error(`moveTo(${x},${y}) timed out at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length}`);
}

function wait(n) {
    for (let i = 0; i < n; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        tick();
    }
}

function waitUntil(pred, max, label) {
    const loops = state.pastRuns.length;
    for (let i = 0; i < max; i++) {
        if (pred()) return state.currentTick;
        if (state.gameState === 'LEVEL_COMPLETE') return state.currentTick;
        tick();
        if (state.pastRuns.length !== loops) {
            throw new Error(`${label}: unexpected rewind (tick ${state.currentTick}, loops ${state.pastRuns.length})`);
        }
    }
    throw new Error(`${label} timed out at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick}`);
}

function pressR() { tick({}, ['r']); }

function grab() {
    tick({}, ['space']);
    tick();
    const carried = state.packages.some(p => p.carriedBy === 'player');
    if (!carried) {
        throw new Error(`grab failed at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick}`);
    }
}

function dropInZone() {
    const z = state.deliveryZone;
    moveTo(z.x + 8, z.y + 8, 2, 400);
    tick({}, ['space']);
    for (let i = 0; i < 8 && state.gameState !== 'LEVEL_COMPLETE'; i++) tick();
}

function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function standOn(id, x, y) {
    moveTo(x, y, 4, 900);
    const plate = state.plates.find(p => p.id === id);
    if (!plate || !overlaps(state.player, plate)) {
        throw new Error(`not on plate ${id} at ${Math.round(state.player.x)},${Math.round(state.player.y)}`);
    }
}

function doorOpen(id) {
    return !!state.doors.find(d => d.id === id)?.isOpen;
}

// ---- intended solutions ----

function solveL1() {
    standOn('p1', 285, 245);
    wait(12);
    pressR();
    moveTo(450, 260, 2, 700);
    moveTo(575, 250, 2, 400);
    grab();
    dropInZone();
}

function solveL2() {
    moveTo(340, 140, 2, 500);
    standOn('p1', 350, 490);
    wait(10);
    pressR();
    moveTo(360, 140, 2, 500);
    moveTo(400, 70, 2, 400);
    grab();
    moveTo(400, 110, 2, 200);
    moveTo(560, 110, 4, 500);
    waitUntil(() => doorOpen('d1'), 800, 'L2 door');
    wait(48);
    moveTo(670, 90, 4, 400);
    dropInZone();
}

function solveL3() {
    standOn('p', 210, 290);
    wait(15);
    pressR();
    moveTo(115, 290, 2, 400);
    grab();
    moveTo(460, 280, 2, 600);
    waitUntil(() => doorOpen('d1'), 400, 'L3 plate door');
    moveTo(590, 280, 2, 400);
    waitUntil(() => doorOpen('t'), 800, 'L3 timer');
    moveTo(710, 290, 2, 400);
    dropInZone();
}

const L4_Y = [40, 130, 220, 310, 400];

function snakeToExit() {
    moveTo(400, L4_Y[0], 2, 400);
    moveTo(400, L4_Y[1], 2, 200);
    moveTo(40, L4_Y[1], 2, 400);
    moveTo(40, L4_Y[2], 2, 200);
    moveTo(400, L4_Y[2], 2, 400);
    moveTo(400, L4_Y[3], 2, 200);
    moveTo(40, L4_Y[3], 2, 400);
    moveTo(40, L4_Y[4], 2, 200);
}

function solveL4() {
    // Door A closes the tick the plate is empty, so one tape cannot hold A and also reach B.
    standOn('a', 190, 48);
    wait(24);
    pressR();
    waitUntil(() => doorOpen('doorA'), 500, 'L4 door A');
    snakeToExit();
    moveTo(530, 400, 4, 400);
    standOn('b', 520, 405);
    wait(24);
    pressR();
    moveTo(78, 40, 4, 300);
    grab();
    waitUntil(() => doorOpen('doorA'), 500, 'L4 door A again');
    snakeToExit();
    moveTo(560, 400, 4, 500);
    waitUntil(() => doorOpen('doorB'), 900, 'L4 door B');
    moveTo(650, 400, 4, 400);
    waitUntil(() => doorOpen('t'), 1200, 'L4 timer');
    moveTo(730, 400, 4, 300);
    dropInZone();
}

function solveMB() {
    standOn('g1', 80, 470);
    wait(12);
    pressR();
    waitUntil(() => doorOpen('d1'), 500, 'MB d1');
    moveTo(270, 270, 2, 400);
    moveTo(320, 270, 2, 300);
    standOn('g2', 310, 470);
    wait(12);
    pressR();
    waitUntil(() => doorOpen('d1'), 500, 'MB d1 again');
    moveTo(300, 270, 2, 500);
    waitUntil(() => doorOpen('d2'), 800, 'MB d2');
    moveTo(520, 270, 2, 400);
    standOn('g3', 530, 470);
    waitUntil(() => doorOpen('vault'), 1400, 'MB vault');
    moveTo(530, 270, 2, 400);
    moveTo(700, 270, 2, 400);
    moveTo(700, 180, 2, 400);
    grab();
    moveTo(710, 450, 2, 500);
    dropInZone();
}

const SOLVERS = [solveL1, solveL2, solveL3, solveL4, solveMB];

function formatSolution(sol) {
    return JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
}

export function recordLevel(levelIndex, outPath) {
    const solve = SOLVERS[levelIndex];
    if (!solve) throw new Error(`no W1 solver for level ${levelIndex}`);
    loadLevel({ level: levelIndex });
    solve();
    if (state.gameState !== 'LEVEL_COMPLETE') {
        throw new Error(`level ${levelIndex} (${state.currentLevelMeta?.name}) not complete: ${state.gameState} tick ${state.currentTick} loops ${state.pastRuns.length}`);
    }
    const sol = JSON.parse(main.exportSolution());
    const par = state.currentLevelMeta?.par;
    if (par != null && sol.completedLoops > par) {
        throw new Error(`level ${levelIndex} over par: ${sol.completedLoops} > ${par}`);
    }
    const text = formatSolution(sol);
    if (outPath) writeFileSync(outPath, text);
    console.error(`recorded ${sol.levelName}: ${sol.loops.length} loops, completed in ${sol.completedLoops}`);
    return sol;
}

// Cheap wrong plans. They must not complete.
export function runNaive(which) {
    const table = {
        'l2-fetch-first': () => {
            loadLevel({ level: 1 });
            moveTo(360, 140, 2, 500);
            moveTo(400, 70, 2, 400);
            grab();
            moveTo(400, 140, 2, 300);
            moveTo(340, 140, 2, 300);
            standOn('p1', 350, 490);
            wait(20);
            // Leave the plate while carrying — the door closes and nobody else holds it.
            moveTo(340, 140, 2, 500);
            moveTo(560, 110, 4, 400);
            wait(30);
            for (let i = 0; i < 400 && state.gameState === 'PLAYING'; i++) tick();
        },
        'l3-leave-plate': () => {
            loadLevel({ level: 2 });
            standOn('p', 210, 290);
            wait(20);
            moveTo(460, 280, 2, 500);
            pressR();
            moveTo(115, 290, 2, 400);
            grab();
            moveTo(460, 280, 2, 500);
            for (let i = 0; i < 900 && state.gameState === 'PLAYING'; i++) tick();
        },
        'l4-two-loops': () => {
            loadLevel({ level: 3 });
            // One echo can hold A or B, not both. Carry through with only A held.
            standOn('a', 190, 48);
            wait(12);
            pressR();
            moveTo(78, 40, 4, 300);
            grab();
            waitUntil(() => doorOpen('doorA'), 500, 'L4 naive door A');
            snakeToExit();
            moveTo(560, 400, 4, 400);
            for (let i = 0; i < 900 && state.gameState === 'PLAYING'; i++) tick();
        },
        'mb-rush-vault': () => {
            loadLevel({ level: 4 });
            moveTo(200, 270, 4, 200);
            for (let i = 0; i < 1500 && state.gameState === 'PLAYING'; i++) tick();
        }
    };
    const fn = table[which];
    if (!fn) throw new Error(`unknown naive plan ${which}`);
    fn();
    return { completed: state.gameState === 'LEVEL_COMPLETE', state: state.gameState, tick: state.currentTick, loops: state.pastRuns.length };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const arg = process.argv[2];
    if (arg === 'naive') {
        const r = runNaive(process.argv[3]);
        console.log(JSON.stringify(r));
        process.exit(r.completed ? 1 : 0);
    }
    const indices = arg === 'all' || arg == null ? Object.keys(FILES).map(Number) : [Number(arg)];
    for (const idx of indices) {
        const out = process.argv[3] && indices.length === 1 ? process.argv[3] : FILES[idx];
        recordLevel(idx, out);
    }
}
