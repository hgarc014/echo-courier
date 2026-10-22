// Scripted W3 solutions. Drives the real sim (same recorder as a dev export).
// Usage: node tests/harness/recordW3.mjs all
//        node tests/harness/recordW3.mjs W3-L1 [out.json]
//        node tests/harness/recordW3.mjs naive <plan>
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main, state, keys, loadLevel, LEVELS } from './replay.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const solDir = join(here, '..', 'solutions');

const FILES = [
    ['W3-L1', join(solDir, 'w3-l1.json')],
    ['W3-L2', join(solDir, 'w3-l2.json')],
    ['W3-L3', join(solDir, 'w3-l3.json')],
    ['W3-L4', join(solDir, 'w3-l4.json')],
    ['W3-MB', join(solDir, 'w3-mb.json')]
];

function levelIndex(prefix) {
    const idx = LEVELS.findIndex(l => typeof l.name === 'string' && l.name.startsWith(prefix));
    if (idx < 0) throw new Error(`missing level ${prefix}`);
    return idx;
}

function tick(dir = {}, extra = [], soft = false) {
    for (const k of ['w', 'a', 's', 'd', 'space', 'r', 'f']) keys[k] = false;
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

function camSeesPlayer() {
    return state.alarmState;
}

function cameraSees(x, y) {
    return state.cameras.some(c => c.canSee ? c.canSee(x, y) : false);
}

// Try a scripted plan with each start delay until one finishes cleanly.
function search(prefix, plan, delays) {
    let last;
    for (const d of delays) {
        loadLevel({ level: levelIndex(prefix) });
        try {
            plan(d);
            if (state.gameState === 'LEVEL_COMPLETE') return d;
            last = new Error(`${prefix} delay ${d}: ${state.gameState} ${state.failMessage || ''}`);
        } catch (e) { last = e; if (process.env.W3DEBUG) console.error(`d=${d}: ${e.message}`); }
    }
    throw last;
}

const range = (a, b, step) => { const out = []; for (let i = a; i <= b; i += step) out.push(i); return out; };

function solveL1() {
    return search('W3-L1', (d) => {
        moveTo(170, 210, 2, 500);
        wait(d);
        moveTo(620, 210, 2, 500);
        grab();
        dropInZone();
    }, range(0, 400, 5));
}
function solveL2() {
    // Loop 1: cross behind the sweep, drop into the pocket, park on the plate.
    // Loop 2: cross on the same beat as the echo, so neither rides the cone.
    return search('W3-L2', (d) => {
        moveTo(170, 210, 2, 500);
        wait(d);
        moveTo(560, 210, 2, 500);
        standOn('p1', 525, 505);
        wait(10);
        pressR();
        moveTo(170, 210, 2, 500);
        wait(d);
        moveTo(560, 210, 2, 500);
        waitUntil(() => doorOpen('d1'), 600, 'L2 inner door');
        moveTo(690, 210, 2, 400);
        grab();
        dropInZone();
    }, range(0, 400, 5));
}
function toss() { tick({}, ['f']); tick(); }

function solveL3() {
    // Loop 1 (the echo): toss the decoy north of the post, then hold the plate.
    // Loop 2: the guard is off on the landing or staring at the echo; take the door.
    return search('W3-L3', (d) => {
        moveTo(60, 190, 2, 500);
        grab();
        moveTo(300, 190, 2, 500);
        moveTo(300, 60, 2, 300);
        // The design beat: the echo's decoy goes up at the 8 s mark.
        waitUntil(() => state.currentTick >= 478 + d, 600, 'L3 8s');
        tick({ x: 1, y: 0 });
        toss();
        moveTo(250, 60, 2, 100);
        moveTo(250, 520, 2, 500);
        moveTo(445, 520, 2, 400);
        standOn('p1', 445, 405);
        wait(10);
        pressR();
        moveTo(40, 430, 2, 500);
        waitUntil(() => state.guards[0].state === 'investigate', 1200, 'L3 lure');
        moveTo(470, 430, 2, 500);
        waitUntil(() => doorOpen('d1'), 900, 'L3 door');
        moveTo(600, 430, 2, 400);
        moveTo(640, 505, 2, 400);
        grab();
        dropInZone();
    }, range(0, 400, 10));
}
// Axis-first walk used by the L4 plan (x, then y), so the recorded route is the
// one the plan search found.
function walk(x, y, max = 900) {
    for (let i = 0; i < max; i++) {
        if (state.gameState === 'LEVEL_COMPLETE') return;
        const dx = x - state.player.x;
        const dy = y - state.player.y;
        if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
        const px = state.player.x;
        const py = state.player.y;
        if (Math.abs(dx) > 3) tick({ x: Math.sign(dx), y: 0 });
        else tick({ x: 0, y: Math.sign(dy) });
        if (px === state.player.x && py === state.player.y && state.rewindFreeze <= 0) {
            throw new Error(`walk(${x},${y}) blocked at ${Math.round(px)},${Math.round(py)} tick ${state.currentTick}`);
        }
    }
    throw new Error(`walk(${x},${y}) timed out`);
}
function solveL4() {
    // Loop 1 (echo): toss the decoy from the top of the gap so it lands north of
    // the crack, then get out of sight to the east. The guard walks over the crack.
    // Loop 2: come up behind the guard, stamp the crack so it collapses behind
    // them, then haul the heavy crate along the bottom while the camera is off it.
    return search('W3-L4', (d) => {
        walk(70, 145); tick({}, ['space']); tick();
        walk(230, 25); tick({ x: 0, y: 1 }); tick({}, ['f']); tick();
        walk(740, 25);
        wait(300);
        pressR();
        wait(40);
        walk(40, 420); wait(160);
        walk(205, 420); walk(205, 370); walk(205, 440);
        wait(150);
        walk(165, 505); tick({}, ['space']); tick();
        walk(165, 545); wait(d); walk(520, 545); walk(520, 505);
        waitUntil(() => doorOpen('td1'), 400, 'L4 timer');
        walk(720, 505); tick({}, ['space']);
        for (let i = 0; i < 10 && state.gameState !== 'LEVEL_COMPLETE'; i++) tick();
    }, range(470, 485, 5));
}
function relaySolved(id) {
    return !!state.wardens?.[0]?.solved?.has(id);
}

function tossFacing(dx, dy) {
    waitUntil(() => state.player.tossCooldown <= 0, 600, 'toss cooldown');
    tick({ x: dx, y: dy });
    toss();
}

function solveMB() {
    return search('W3-MB', (d) => {
        moveTo(390, 205, 2, 600);
        grab();
        tossFacing(-1, 0);
        wait(30 + d);
        standOn('r1', 465, 133);
        waitUntil(() => relaySolved('r1'), 120, 'MB r1');
        standOn('r3', 385, 105);
        waitUntil(() => relaySolved('r3'), 120, 'MB r3');
        moveTo(337, 85, 2, 200);
        grab();
        tossFacing(1, 0);
        wait(30);
        standOn('r2', 305, 133);
        if (process.env.W3DEBUG) console.error('r2 facing', state.wardens[0].facingAngle * 180 / Math.PI, JSON.stringify(state.noiseEvents.slice(-3)));
        waitUntil(() => relaySolved('r2'), 120, 'MB r2');
        waitUntil(() => doorOpen('boss_door'), 60, 'MB door');
        moveTo(460, 480, 2, 600);
        moveTo(645, 485, 2, 400);
        grab();
        dropInZone();
    }, range(0, 60, 10));
}

const SOLVERS = { 'W3-L1': solveL1, 'W3-L2': solveL2, 'W3-L3': solveL3, 'W3-L4': solveL4, 'W3-MB': solveMB };

function formatSolution(sol) {
    return JSON.stringify(sol, null, 1).replace(/\[\n\s+"([^"]*)",\n\s+(\d+)\n\s+\]/g, '["$1", $2]') + '\n';
}

export function recordLevel(prefix, outPath) {
    const solve = SOLVERS[prefix];
    if (!solve) throw new Error(`no W3 solver for ${prefix}`);
    const d = solve();
    console.error(`${prefix} delay ${d}`);
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

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const arg = process.argv[2] || 'all';
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
