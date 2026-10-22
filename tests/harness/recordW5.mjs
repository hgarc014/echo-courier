// Scripted W5 solutions. Drives the real sim (same recorder as a dev export).
// Usage: node tests/harness/recordW5.mjs all
//        node tests/harness/recordW5.mjs W5-L1 [out.json]
//        node tests/harness/recordW5.mjs naive <plan>
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel, LEVELS } from './replay.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const solDir = join(here, '..', 'solutions');

const FILES = [
    ['W5-L1', join(solDir, 'w5-l1.json')],
    ['W5-L2', join(solDir, 'w5-l2.json')],
    ['W5-L3', join(solDir, 'w5-l3.json')]
];

function levelIndex(prefix) {
    const idx = LEVELS.findIndex(l => typeof l.name === 'string' && l.name.startsWith(prefix));
    if (idx < 0) throw new Error(`missing level ${prefix}`);
    return idx;
}

let dashSpam = false;

function tick(dir = {}, extra = [], soft = false) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r']) keys[k] = false;
    if (dir.x > 0) keys.d = true;
    if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true;
    if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
    keys.shift = dashSpam && state.currentTick % 2 === 0;
    main.stepSimulation();
    if (!soft && state.failMessage) {
        throw new Error(`failed: ${state.failMessage} at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length} hp ${state.prisms?.[0]?.hp ?? '-'}`);
    }
}

function moveTo(x, y, tol = 4, max = 900, soft = false) {
    let stuck = 0;
    for (let i = 0; i < max; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        if (soft && state.failMessage) return;
        const dx = x - state.player.x;
        const dy = y - state.player.y;
        if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;
        let sx = 0;
        let sy = 0;
        if (Math.abs(dx) > tol && (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) <= tol)) sx = Math.sign(dx);
        else if (Math.abs(dy) > tol) sy = Math.sign(dy);
        else return;
        const px = state.player.x;
        const py = state.player.y;
        const frozen = state.rewindFreeze > 0;
        tick({ x: sx, y: sy }, [], soft);
        if (soft && state.failMessage) return;
        if (frozen) { stuck = 0; continue; }
        const ndx = x - state.player.x;
        const ndy = y - state.player.y;
        if (Math.abs(ndx) <= tol && Math.abs(ndy) <= tol) return;
        const closer = Math.abs(ndx) + Math.abs(ndy) < Math.abs(dx) + Math.abs(dy) - 0.5;
        const moved = state.player.x !== px || state.player.y !== py;
        if (moved && closer) { stuck = 0; continue; }
        stuck++;
        if (Math.abs(dx) <= 4 + tol && Math.abs(dy) <= 4 + tol) return;
        if (stuck > 8) {
            throw new Error(`moveTo(${x},${y}) blocked at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length}`);
        }
    }
    throw new Error(`moveTo(${x},${y}) timed out at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} loops ${state.pastRuns.length}`);
}

function wait(n, soft = false) {
    for (let i = 0; i < n; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        if (soft && state.failMessage) return;
        tick({}, [], soft);
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
    throw new Error(`${label} timed out at ${Math.round(state.player.x)},${Math.round(state.player.y)} tick ${state.currentTick} hp ${state.prisms?.[0]?.hp ?? '-'}`);
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
    moveTo(z.x + 8, z.y + 8, 2, 500);
    tick({}, ['space']);
    for (let i = 0; i < 8 && state.gameState !== 'LEVEL_COMPLETE'; i++) tick();
}

function overlaps(a, b) {
    return a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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

// Corner plates. The airlock gap is y=240..360; the corridor line is y=285.
const NW = [60, 60];
const SW = [60, 500];

function holdAndLoop(id, [x, y]) {
    moveTo(x, 285, 2, 600);
    standOn(id, x, y);
    wait(4);
    pressR();
}

function deliverThroughAirlock(doorIds) {
    moveTo(300, 285, 2, 600);
    grab();
    moveTo(370, 285, 2, 300);
    waitUntil(() => doorIds.every(doorOpen), 400, 'airlock');
    dropInZone();
}

function solveL1() {
    holdAndLoop('p_first', NW);
    holdAndLoop('p_plain', SW);
    deliverThroughAirlock(['d_first', 'd_plain']);
}

function solveL2() {
    // Loop order is the whole puzzle: oldest on magenta, newest on blue.
    holdAndLoop('p_first', NW);
    holdAndLoop('p_last', SW);
    deliverThroughAirlock(['d_first', 'd_last']);
}

function gateHeld() {
    const gate = state.doors.find(d => d.id === 'gate');
    return state.activeGhosts.some(g => g.isActive && overlaps(g, gate));
}

// Through the static band to G: about 3.5 s for me, about 6 s for the echo.
function slowRoad() {
    moveTo(40, 40, 2, 300);
    moveTo(360, 40, 2, 300);
    moveTo(360, 285, 2, 300);
}

// Closet route: in at the right end, under the fin, up to the parcel, and back.
const CLOSET = [[370, 285], [370, 495], [60, 495], [60, 372]];
function fetchL3(soft = false) {
    for (const [x, y] of CLOSET) moveTo(x, y, 2, 400, soft);
    if (soft) { tick({}, ['space'], true); tick({}, [], true); }
    else grab();
    for (const [x, y] of [...CLOSET].reverse().slice(1)) moveTo(x, y, 2, 400, soft);
}

function solveL3() {
    slowRoad();
    moveTo(555, 285, 2, 300);
    standOn('p_top', 555, 60);
    wait(4);
    pressR();
    moveTo(555, 285, 2, 600);
    standOn('p_bottom', 555, 500);
    wait(4);
    pressR();
    fetchL3();
    moveTo(368, 285, 2, 300);
    waitUntil(gateHeld, 300, 'echo in the gate');
    moveTo(585, 285, 2, 300);
    waitUntil(() => doorOpen('d_top') && doorOpen('d_bottom'), 300, 'airlock');
    dropInZone();
}

const SOLVERS = {
    'W5-L1': solveL1,
    'W5-L2': solveL2,
    'W5-L3': solveL3
};

function formatSolution(sol) {
    return JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
}

export function recordLevel(prefix, outPath) {
    const solve = SOLVERS[prefix];
    if (!solve) throw new Error(`no W5 solver for ${prefix}`);
    loadLevel({ level: levelIndex(prefix) });
    solve();
    if (state.gameState !== 'LEVEL_COMPLETE') {
        throw new Error(`${prefix} (${state.currentLevelMeta?.name}) not complete: ${state.gameState} tick ${state.currentTick} loops ${state.pastRuns.length} fail ${state.failMessage || ''}`);
    }
    const sol = JSON.parse(main.exportSolution());
    const par = state.currentLevelMeta?.par;
    if (par != null && sol.completedLoops > par) {
        throw new Error(`${prefix} over par: ${sol.completedLoops} > ${par}`);
    }
    const text = formatSolution(sol);
    if (outPath) writeFileSync(outPath, text);
    console.error(`recorded ${sol.levelName}: index ${sol.level}, ${sol.loops.length} loops, completed in ${sol.completedLoops}`);
    return sol;
}

// Fastest possible haul: dash on every cooldown, no echoes. Returns the tick the
// courier reaches the gate mouth and whether the gate was still open then.
export function dashRushL3() {
    loadLevel({ level: levelIndex('W5-L3') });
    dashSpam = true;
    try {
        fetchL3(true);
        moveTo(368, 285, 2, 400, true);
    } finally {
        dashSpam = false;
    }
    return { tick: state.currentTick, gateOpen: doorOpen('gate'), dashes: state.runStats?.dashes ?? 0 };
}

export function runNaive(which) {
    const softMove = (x, y) => moveTo(x, y, 4, 700, true);
    const plateLoop = ([x, y]) => {
        softMove(x, 285);
        softMove(x, y);
        wait(4, true);
        if (!state.failMessage) pressR();
    };
    const haul = () => {
        softMove(300, 285);
        tick({}, ['space'], true);
        tick({}, [], true);
        // Push into the airlock for 6s; a shut door just holds the courier there.
        for (let i = 0; i < 360 && state.gameState !== 'LEVEL_COMPLETE' && !state.failMessage; i++) {
            tick({ x: 1 }, [], true);
        }
        tick({}, ['space'], true);
        wait(30, true);
    };
    const haul3 = () => {
        fetchL3(true);
        softMove(368, 285);
        for (let i = 0; i < 500 && state.gameState !== 'LEVEL_COMPLETE' && !state.failMessage; i++) {
            tick({ x: 1 }, [], true);
        }
        tick({}, ['space'], true);
        wait(30, true);
    };
    const table = {
        'l3-control': () => {
            loadLevel({ level: levelIndex('W5-L3') });
            slowRoad();
            softMove(555, 285); softMove(555, 60); wait(4, true); pressR();
            softMove(555, 285); softMove(555, 500); wait(4, true); pressR();
            haul3();
        },
        // Plain plate first, magenta second: echo 2 is not the first echo.
        'l1-plain-first': () => {
            loadLevel({ level: levelIndex('W5-L1') });
            plateLoop(SW);
            plateLoop(NW);
            haul();
        },
        // One echo on magenta, then try to carry through with the plain plate empty.
        'l1-one-echo': () => {
            loadLevel({ level: levelIndex('W5-L1') });
            plateLoop(NW);
            haul();
        },
        // Both echoes take the direct road: each crosses G long before the parcel can.
        'l3-direct': () => {
            loadLevel({ level: levelIndex('W5-L3') });
            softMove(555, 285); softMove(555, 60); wait(4, true); if (!state.failMessage) pressR();
            softMove(555, 285); softMove(555, 500); wait(4, true); if (!state.failMessage) pressR();
            haul3();
        },
        // Park an echo in G. G stays open, but one echo cannot hold both airlock plates.
        'l3-park': () => {
            loadLevel({ level: levelIndex('W5-L3') });
            softMove(460, 285); wait(4, true); if (!state.failMessage) pressR();
            softMove(555, 285); softMove(555, 60); wait(4, true); if (!state.failMessage) pressR();
            haul3();
        },
        // Control: the same haul with the loops in the right order does complete.
        'l2-control': () => {
            loadLevel({ level: levelIndex('W5-L2') });
            plateLoop(NW);
            plateLoop(SW);
            haul();
        },
        // Blue works the moment echo 1 exists, so it looks solved. Then a second
        // echo goes to magenta: it is not first, and echo 1 is no longer last.
        'l2-blue-first': () => {
            loadLevel({ level: levelIndex('W5-L2') });
            plateLoop(SW);
            plateLoop(NW);
            haul();
        }
    };
    const fn = table[which];
    if (!fn) throw new Error(`unknown naive plan ${which}`);
    fn();
    return {
        completed: state.gameState === 'LEVEL_COMPLETE',
        state: state.gameState,
        tick: state.currentTick,
        loops: state.pastRuns.length,
        fail: state.failMessage || ''
    };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const arg = process.argv[2] || 'all';
    if (arg === 'dash') { console.log(JSON.stringify(dashRushL3())); process.exit(0); }
    if (arg === 'naive') {
        const r = runNaive(process.argv[3]);
        console.log(JSON.stringify(r));
        process.exit(r.completed ? 1 : 0);
    }
    const jobs = arg === 'all' ? FILES : FILES.filter(([prefix]) => prefix === arg || prefix.endsWith(arg));
    if (!jobs.length) {
        console.error(`unknown level ${arg}`);
        process.exit(1);
    }
    for (const [prefix, out] of jobs) {
        const dest = process.argv[3] && jobs.length === 1 ? process.argv[3] : out;
        recordLevel(prefix, dest);
    }
}
