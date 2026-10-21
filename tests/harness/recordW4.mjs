// Scripted W4 solutions. Drives the real sim (same recorder as a dev export).
// Usage: node tests/harness/recordW4.mjs all
//        node tests/harness/recordW4.mjs W4-L1 [out.json]
//        node tests/harness/recordW4.mjs naive <plan>
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel, LEVELS } from './replay.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const solDir = join(here, '..', 'solutions');

const FILES = [
    ['W4-L1', join(solDir, 'w4-l1.json')],
    ['W4-L2', join(solDir, 'w4-l2.json')],
    ['W4-L3', join(solDir, 'w4-l3.json')],
    ['W4-L4', join(solDir, 'w4-l4.json')],
    ['W4-MB', join(solDir, 'w4-mb.json')]
];

function levelIndex(prefix) {
    const idx = LEVELS.findIndex(l => typeof l.name === 'string' && l.name.startsWith(prefix));
    if (idx < 0) throw new Error(`missing level ${prefix}`);
    return idx;
}

function tick(dir = {}, extra = [], soft = false) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r']) keys[k] = false;
    if (dir.x > 0) keys.d = true;
    if (dir.x < 0) keys.a = true;
    if (dir.y > 0) keys.s = true;
    if (dir.y < 0) keys.w = true;
    for (const k of extra) keys[k] = true;
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

function laserOff(id) {
    const laser = state.lasers.find(l => l.id === id);
    return !!(laser && laser.isOpen);
}

function doorOpen(id) {
    return !!state.doors.find(d => d.id === id)?.isOpen;
}

function shieldGhostIn(id) {
    const laser = state.lasers.find(l => l.id === id);
    return state.activeGhosts.some(g => g.isActive && g.facingY === 0 && g.facingX < 0 && overlaps(g, laser));
}

function shieldGhostUp(id) {
    const laser = state.lasers.find(l => l.id === id);
    return state.activeGhosts.some(g => g.isActive && g.facingX === 0 && g.facingY < 0 && overlaps(g, laser));
}

// ---- intended solutions ----

function solveL1() {
    standOn('p1', 120, 275);
    wait(12);
    pressR();
    waitUntil(() => laserOff('l1'), 400, 'L1 laser');
    moveTo(500, 280, 2, 700);
    grab();
    dropInZone();
}

function solveL2() {
    moveTo(50, 80, 2, 400);
    standOn('p1', 240, 80);
    wait(360);
    moveTo(620, 80, 2, 500);
    standOn('p2', 620, 80);
    wait(20);
    pressR();
    moveTo(50, 450, 2, 500);
    moveTo(220, 450, 2, 400);
    grab();
    moveTo(300, 450, 2, 300);
    waitUntil(() => laserOff('l1'), 500, 'L2 beam 1');
    moveTo(450, 450, 2, 400);
    waitUntil(() => laserOff('l2'), 800, 'L2 beam 2');
    moveTo(660, 450, 2, 500);
    dropInZone();
}

function solveL3() {
    // Alcove under the beam, then up into it so the last facing is toward the emitter.
    moveTo(386, 500, 2, 500);
    moveTo(386, 180, 2, 500);
    wait(16);
    pressR();
    waitUntil(() => shieldGhostUp('beam'), 500, 'L3 shield');
    wait(30);
    moveTo(70, 390, 2, 500);
    grab();
    moveTo(300, 400, 2, 400);
    moveTo(520, 400, 2, 400);
    dropInZone();
}

function solveL4() {
    moveTo(700, 430, 2, 800);
    moveTo(700, 260, 2, 400);
    moveTo(230, 260, 2, 700);
    wait(12);
    pressR();
    standOn('p2', 80, 470);
    wait(16);
    pressR();
    moveTo(140, 490, 2, 400);
    grab();
    moveTo(580, 450, 2, 600);
    waitUntil(() => shieldGhostIn('beam'), 800, 'L4 shield');
    moveTo(580, 112, 2, 500);
    moveTo(400, 112, 2, 400);
    waitUntil(() => laserOff('l2'), 400, 'L4 hall laser');
    moveTo(280, 112, 2, 400);
    waitUntil(() => doorOpen('ad'), 600, 'L4 alarm door');
    moveTo(200, 112, 2, 300);
    waitUntil(() => doorOpen('td'), 500, 'L4 timer');
    moveTo(50, 80, 2, 400);
    dropInZone();
}

function solveMB() {
    // East shaft is outside the beam (x>=640) and west of the closet door (x=710).
    moveTo(660, 530, 2, 500);
    moveTo(660, 440, 2, 300);
    moveTo(210, 440, 2, 700);
    wait(12);
    pressR();
    // Ammo sits in the south room. Carry it through the shielded gate during a north-facing window.
    waitUntil(() => shieldGhostIn('gate') && state.currentTick >= 240, 800, 'MB gate shield');
    moveTo(420, 530, 2, 400);
    grab();
    moveTo(660, 530, 2, 500);
    moveTo(660, 440, 2, 300);
    moveTo(385, 440, 2, 500);
    moveTo(385, 248, 2, 400);
    waitUntil(() => state.prisms[0].hp <= 2, 600, 'MB hit 1');
    moveTo(385, 440, 2, 400);
    moveTo(660, 440, 2, 500);
    moveTo(660, 530, 2, 300);
    moveTo(180, 530, 2, 600);
    grab();
    waitUntil(() => state.currentTick >= 1000, 800, 'MB past south sweep');
    moveTo(660, 530, 2, 600);
    moveTo(660, 440, 2, 300);
    moveTo(385, 440, 2, 500);
    moveTo(385, 248, 2, 400);
    waitUntil(() => state.prisms[0].hp <= 1, 600, 'MB hit 2');
    moveTo(385, 440, 2, 400);
    moveTo(660, 440, 2, 500);
    moveTo(660, 530, 2, 300);
    moveTo(480, 530, 2, 400);
    pressR();
    // The loop-2 echo replays both carries and lands the killing hit.
    waitUntil(() => doorOpen('boss_door'), 1400, 'MB door');
    moveTo(560, 530, 2, 400);
    grab();
    waitUntil(() => doorOpen('boss_door'), 400, 'MB door still');
    dropInZone();
}

const SOLVERS = {
    'W4-L1': solveL1,
    'W4-L2': solveL2,
    'W4-L3': solveL3,
    'W4-L4': solveL4,
    'W4-MB': solveMB
};

function formatSolution(sol) {
    return JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
}

export function recordLevel(prefix, outPath) {
    const solve = SOLVERS[prefix];
    if (!solve) throw new Error(`no W4 solver for ${prefix}`);
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

export function runNaive(which) {
    const softMove = (x, y) => moveTo(x, y, 4, 700, true);
    const table = {
        'l2-one-plate': () => {
            loadLevel({ level: levelIndex('W4-L2') });
            moveTo(50, 80, 2, 400, true);
            standOn('p1', 240, 80);
            wait(40, true);
            moveTo(50, 80, 2, 400, true);
            moveTo(50, 450, 2, 500, true);
            softMove(220, 450);
            if (!state.failMessage) {
                tick({}, ['space'], true);
                tick({}, [], true);
            }
            softMove(450, 450);
            softMove(660, 450);
            wait(200, true);
        },
        'l3-no-shield': () => {
            loadLevel({ level: levelIndex('W4-L3') });
            softMove(70, 390);
            tick({}, ['space'], true);
            tick({}, [], true);
            softMove(300, 400);
            softMove(520, 400);
            wait(120, true);
        },
        'l4-crack-park': () => {
            loadLevel({ level: levelIndex('W4-L4') });
            softMove(700, 430);
            softMove(700, 260);
            softMove(500, 260);
            wait(10, true);
            if (!state.failMessage) pressR();
            wait(80, true);
            softMove(140, 490);
            tick({}, ['space'], true);
            tick({}, [], true);
            softMove(580, 450);
            softMove(580, 112);
            wait(80, true);
        },
        'mb-no-shield': () => {
            loadLevel({ level: levelIndex('W4-MB') });
            // Into the gate facing along it (safe), then north with no shielded echo.
            softMove(660, 530);
            softMove(660, 440);
            softMove(385, 440);
            softMove(385, 300);
            wait(40, true);
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
