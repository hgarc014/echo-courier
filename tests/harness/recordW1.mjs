// Scripted W1 solutions. Drives the real sim (same recorder as a dev export).
// Usage: node tests/harness/recordW1.mjs <levelIndex> [out.json]
//    or: node tests/harness/recordW1.mjs all
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel } from './replay.mjs';
import { displayedLoopNumber } from '../../src/core/loopDisplay.js';

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

function moveTo(x, y, tol = 4, max = 900, opts = {}) {
    let stuck = 0;
    const echoes = state.pastRuns.length;
    for (let i = 0; i < max; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return 'done';
        if (opts.stopOnRewind && state.pastRuns.length !== echoes) return 'rewind';
        const dx = x - state.player.x;
        const dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return 'ok';
        // Axis-aligned. Diagonal steps are 4/√2 and orbit a target forever.
        let sx = 0, sy = 0;
        if (Math.abs(dx) > tol && (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) <= tol)) sx = Math.sign(dx);
        else if (Math.abs(dy) > tol) sy = Math.sign(dy);
        else return 'ok';
        const px = state.player.x;
        const py = state.player.y;
        const frozen = state.rewindFreeze > 0;
        tick({ x: sx, y: sy });
        if (opts.stopOnRewind && state.pastRuns.length !== echoes) return 'rewind';
        if (frozen) { stuck = 0; continue; }
        const ndx = x - state.player.x;
        const ndy = y - state.player.y;
        if (Math.abs(ndx) <= tol && Math.abs(ndy) <= tol) return 'ok';
        const closer = Math.abs(ndx) + Math.abs(ndy) < Math.abs(dx) + Math.abs(dy) - 0.5;
        const moved = state.player.x !== px || state.player.y !== py;
        if (moved && closer) { stuck = 0; continue; }
        stuck++;
        // A 4px step that overshoots a nearby point is close enough.
        if (Math.abs(dx) <= 4 + tol && Math.abs(dy) <= 4 + tol) return 'ok';
        if (stuck > 8) {
            if (opts.allowBlocked) return 'blocked';
            throw new Error(`moveTo(${x},${y}) blocked at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length}`);
        }
    }
    if (opts.allowBlocked) return 'timeout';
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
    standOn('p1', 48, 508);
    wait(8);
    pressR();
    moveTo(520, 60, 2, 500);
    grab();
    waitUntil(() => doorOpen('d1'), 500, 'L2 door');
    moveTo(660, 70, 4, 400);
    dropInZone();
}

function solveL3() {
    standOn('p', 258, 298);
    wait(8);
    pressR();
    moveTo(145, 280, 2, 400);
    moveTo(145, 500, 2, 400);
    grab();
    moveTo(145, 280, 2, 400);
    moveTo(390, 280, 2, 500);
    waitUntil(() => doorOpen('d1'), 500, 'L3 plate door');
    moveTo(600, 280, 2, 400);
    waitUntil(() => doorOpen('t'), 800, 'L3 timer');
    moveTo(724, 270, 4, 300);
    dropInZone();
}

function solveL4() {
    // Door A closes the tick the plate is empty, so one tape cannot hold A and also reach B.
    standOn('a', 158, 168);
    wait(10);
    pressR();
    waitUntil(() => doorOpen('doorA'), 400, 'L4 door A');
    moveTo(200, 170, 4, 300);
    moveTo(360, 170, 4, 400);
    moveTo(338, 468, 4, 500);
    standOn('b', 338, 468);
    wait(10);
    pressR();
    moveTo(40, 420, 4, 500);
    grab();
    moveTo(40, 170, 4, 400);
    waitUntil(() => doorOpen('doorA'), 500, 'L4 door A again');
    moveTo(360, 170, 4, 500);
    waitUntil(() => doorOpen('doorB'), 800, 'L4 door B');
    moveTo(560, 170, 4, 400);
    waitUntil(() => doorOpen('t'), 800, 'L4 timer');
    moveTo(710, 170, 4, 300);
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
            // Real fetch-first: grab the package, walk it to the shaft plate, press R,
            // then try to deliver on the next loop while that echo holds the door.
            loadLevel({ level: 1 });
            const pkg = state.packages.find(p => p.requiredForDelivery !== false);
            const plate = state.plates.find(p => p.id === 'p1');
            const zone = state.deliveryZone;
            const walk = { stopOnRewind: true, allowBlocked: true };
            moveTo(pkg.x, pkg.y, 2, 800, walk);
            if (state.pastRuns.length === 0 && state.gameState === 'PLAYING') grab();
            const beforePlate = state.pastRuns.length;
            moveTo(plate.x + 8, plate.y + 8, 4, 1200, walk);
            const onPlate = overlaps(state.player, plate);
            if (state.pastRuns.length === beforePlate && state.gameState === 'PLAYING') pressR();
            else if (state.gameState === 'PLAYING') {
                // Loop clock already rewound the fetch. Press R once the freeze lifts
                // so the scripted inputs include an R, from spawn — not a plate hold.
                wait(20);
                if (state.gameState === 'PLAYING') pressR();
            }
            const afterEcho = state.pastRuns.length;
            if (state.gameState !== 'PLAYING') return;
            moveTo(pkg.x, pkg.y, 4, 800, walk);
            if (state.pastRuns.length === afterEcho && !state.packages.some(p => p.carriedBy === 'player')) {
                try { grab(); } catch { /* package is with the echo, or out of reach */ }
            }
            moveTo(zone.x + 10, zone.y + 10, 6, 800, walk);
            if (state.packages.some(p => p.carriedBy === 'player') && overlaps(state.player, zone)) {
                tick({}, ['space']);
            }
            for (let i = 0; i < 240 && state.gameState === 'PLAYING' && state.pastRuns.length <= afterEcho; i++) tick();
        },
        'l3-leave-plate': () => {
            loadLevel({ level: 2 });
            const plate = state.plates.find(p => p.id === 'p');
            standOn('p', plate.x + 8, plate.y + 8);
            wait(12);
            moveTo(plate.x + 70, plate.y + 8, 4, 400, { allowBlocked: true });
            pressR();
            const pkg = state.packages.find(p => p.requiredForDelivery !== false);
            moveTo(pkg.x, 280, 4, 400, { allowBlocked: true });
            moveTo(pkg.x, pkg.y, 4, 400, { allowBlocked: true });
            try { grab(); } catch { /* echo walked off; door is shut */ }
            moveTo(600, 280, 4, 600, { allowBlocked: true });
            for (let i = 0; i < 500 && state.gameState === 'PLAYING'; i++) tick();
        },
        'l3-first-window': () => {
            // Echo holds the plate (so the only miss is the timer). Sprint for gate T
            // and give up before its second opening.
            loadLevel({ level: 2 });
            const plate = state.plates.find(p => p.id === 'p');
            const pkg = state.packages.find(p => p.requiredForDelivery !== false);
            const timer = state.doors.find(d => d.id === 't');
            const second = (timer.openT || 0) + (timer.closedT || 0);
            standOn('p', plate.x + 8, plate.y + 8);
            wait(6);
            pressR();
            moveTo(pkg.x, 280, 4, 400);
            moveTo(pkg.x, pkg.y, 4, 400);
            grab();
            moveTo(pkg.x, 280, 4, 400);
            moveTo(timer.x - 50, 280, 4, 800, { stopOnRewind: true, allowBlocked: true });
            while (state.currentTick < second - 25 && state.gameState === 'PLAYING' && state.pastRuns.length < 2) {
                moveTo(timer.x + timer.w + 8, 280, 4, 6, { stopOnRewind: true, allowBlocked: true });
            }
            moveTo(timer.x - 90, 280, 4, 40, { allowBlocked: true });
        },
        'l4-two-loops': () => {
            loadLevel({ level: 3 });
            // One echo can hold A or B, not both. Carry through with only A held.
            const plate = state.plates.find(p => p.id === 'a');
            const pkg = state.packages.find(p => p.requiredForDelivery !== false);
            standOn('a', plate.x + 8, plate.y + 8);
            wait(8);
            pressR();
            moveTo(pkg.x, pkg.y, 4, 500);
            grab();
            moveTo(pkg.x, 170, 4, 400);
            waitUntil(() => doorOpen('doorA'), 500, 'L4 naive door A');
            moveTo(360, 170, 4, 500);
            moveTo(450, 170, 4, 400, { allowBlocked: true });
            for (let i = 0; i < 700 && state.gameState === 'PLAYING'; i++) tick();
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
    return {
        completed: state.gameState === 'LEVEL_COMPLETE',
        state: state.gameState,
        tick: state.currentTick,
        loops: displayedLoopNumber(state.loopNumber),
        par: state.currentLevelMeta?.par ?? null
    };
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
