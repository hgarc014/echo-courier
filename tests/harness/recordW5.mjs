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
    ['W5-L3', join(solDir, 'w5-l3.json')],
    ['W5-L4', join(solDir, 'w5-l4.json')],
    ['W5-BOSS', join(solDir, 'w5-boss.json')]
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
    keys.shift = extra.includes('shift') || (dashSpam && state.currentTick % 2 === 0);
    main.stepSimulation();
    if (process.env.XR9DBG && state.robots?.[0]) xr9Debug();
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

function guardPinned() {
    return state.guards.some(g => g.state === 'distracted');
}

// Down the left room, into the alcove, then straight up the beam (facing the emitter).
function upTheBeam(topY, soft = false) {
    moveTo(40, 530, 2, 400, soft);
    moveTo(198, 530, 2, 300, soft);
    // Straight up only: any sideways step inside the beam faces away from the emitter.
    for (let i = 0; i < 400 && state.player.y > topY + 1; i++) {
        if (soft && state.failMessage) return;
        const y = state.player.y;
        tick({ y: -1 }, [], soft);
        if (state.player.y === y) break;
    }
}

function shieldParked() {
    const g = state.activeGhosts.find(e => e.id === 0) || state.activeGhosts[0];
    return !!(g && g.isActive && g.y <= 40 && g.facingY < 0 && g.facingX === 0);
}

const l4log = (m) => { if (process.env.L4DBG) console.error('L4', state.pastRuns.length, state.currentTick, m, Math.round(state.player.x), Math.round(state.player.y)); };
function solveL4() {
    // Loop 1, first echo: shield parked on the magenta plate at the top of the beam.
    upTheBeam(36);
    wait(6);
    l4log('R'); pressR();
    // Loop 2, middle echo: the pocket, where the guard can see it but not reach it.
    upTheBeam(76);
    // The shield crawls through static on its way here; turn only once it is set.
    waitUntil(shieldParked, 600, 'shield parked (loop 2)');
    moveTo(295, 76, 2, 300);
    wait(6);
    l4log('R'); pressR();
    // Loop 3, last echo: the blue plate, once the guard is pinned.
    // Wait above the static: an echo idling in static replays the wait at half speed too.
    moveTo(40, 100, 2, 400);
    waitUntil(guardPinned, 1500, 'guard pinned (loop 3)');
    moveTo(40, 300, 2, 400);
    moveTo(480, 300, 2, 400);
    standOn('p_last', 480, 520);
    wait(6);
    l4log('R'); pressR();
    // Loop 4: the glass.
    moveTo(60, 300, 2, 400);
    grab();
    waitUntil(guardPinned, 1500, 'guard pinned (haul)');
    l4log('pinned, cross; guard y ' + Math.round(state.guards[0].y) + ' echo2 ' + state.activeGhosts.map(g => Math.round(g.x) + ',' + Math.round(g.y)).join(' ')); moveTo(525, 300, 2, 500);
    l4log('hall done'); waitUntil(() => doorOpen('d_first') && doorOpen('d_last'), 900, 'airlock'); l4log('airlock');
    moveTo(585, 300, 2, 200);
    waitUntil(() => doorOpen('td'), 1500, 'timer door');
    l4log('td'); dropInZone();
}

// XR-9: bait slots (tick the decoy shows in the booth) and arena waypoints.
export const XR9 = { Ta: 300, Tb: 650, Tc: 1000 };
const XR9_WAIT = [480, 200];
function xr9Debug() {
    const r = state.robots[0];
    const [lo, hi] = process.env.XR9DBG.split(',').map(Number);
    if (state.currentTick < lo || state.currentTick > hi) return;
    const t = r.lockTarget === state.player ? 'P' : r.lockTarget ? 'G' + r.lockTarget.id : '-';
    if (process.env.XR9PROJ) { for (const p of state.projectiles) console.log('  proj', Math.round(p.x), Math.round(p.y), p.active); const g = state.activeGhosts.map(g => g.id + ':' + Math.round(g.x) + ',' + Math.round(g.y) + (g.isActive ? '' : 'x')).join(' '); console.log('  ghosts', g); }
    console.log(state.pastRuns.length, state.currentTick, 'hp', r.hp, 'cd', r.fireCooldown, r.windingUp ? 'W' : '', r.aimLocked ? 'L' : '', r.hitFlicker, 'face', r.facingAngle.toFixed(2), 'tgt', t, 'p', Math.round(state.player.x), Math.round(state.player.y), 'back', doorOpen('d_back'));
}
function xr9Robot() { return state.robots?.[0]; }
function waitTick(t, soft = false) {
    while (state.currentTick < t && state.gameState !== 'LEVEL_COMPLETE') {
        if (soft && state.failMessage) return;
        tick({}, [], soft);
    }
}
function goNorth(x, soft = false) {
    moveTo(state.player.x, 40, 2, 300, soft);
    moveTo(x, 40, 2, 400, soft);
}
// Decoy: wait above the booth, show in it at t for a moment, step back out.
function xr9Bait(t, soft = false, linger = 18) {
    goNorth(245, soft);
    moveTo(245, 225, 2, 300, soft);
    waitTick(t, soft);
    moveTo(245, 285, 2, 60, soft);
    wait(linger, soft);
    moveTo(245, 225, 2, 60, soft);
}
// Blue holder: hidden north of the plate, on it just after the decoy turns XR-9,
// off again once the courier is clear, before the robot's sights come round.
function xr9Plate(t, soft = false, hold = 85) {
    goNorth(705, soft);
    moveTo(705, 230, 2, 300, soft);
    waitTick(t + 15, soft);
    moveTo(705, 285, 2, 40, soft);
    wait(hold, soft);
    moveTo(705, 230, 2, 40, soft);
}
// Courier: hidden north of the back door, in once the decoy has turned XR-9.
function xr9Hit(t, soft = false) {
    goNorth(XR9_WAIT[0], soft);
    moveTo(...XR9_WAIT, 2, 200, soft);
    waitTick(t + 15, soft);
    moveTo(480, 285, 2, 80, soft);
    moveTo(416, 285, 2, 40, soft);
}
function xr9Retreat(soft = false) {
    moveTo(480, 285, 2, 40, soft);
    moveTo(...XR9_WAIT, 2, 80, soft);
}
function solveBoss() {
    const { Ta, Tb, Tc } = XR9;
    const hp = () => xr9Robot().hp;
    // Loop 1: decoy for the first hit.
    xr9Bait(Ta);
    pressR();
    // Loop 2: blue for loop 3's hit, then decoy for the second hit.
    xr9Plate(Ta);
    xr9Bait(Tb);
    pressR();
    // Loop 3: first hit, blue plate for loop 4, decoy for the third hit.
    xr9Hit(Ta);
    waitUntil(() => hp() === 2, 40, 'XR-9 hit 1');
    xr9Retreat();
    xr9Plate(Tb);
    xr9Bait(Tc);
    pressR();
    // Loop 4: second hit, then blue plate for loop 5.
    xr9Hit(Tb);
    waitUntil(() => hp() === 1, 40, 'XR-9 hit 2');
    xr9Retreat();
    xr9Plate(Tc);
    pressR();
    // Loop 5: last hit opens the vault.
    xr9Hit(Tc);
    waitUntil(() => hp() === 0, 40, 'XR-9 hit 3');
    moveTo(480, 285, 2, 40);
    moveTo(480, 530, 2, 120);
    moveTo(630, 530, 2, 80);
    grab();
    dropInZone();
}

const SOLVERS = {
    'W5-BOSS': solveBoss,
    'W5-L4': solveL4,
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

// Port of QA B's cold driver (qab-evidence/pr56/xr.js): plan = loops of steps
// ['go',cx,cy,dash?] (player centre), ['wait',n], ['sp'], ['end'] (until the loop resets).
export const QA_XR9_PLANS = {
    // Echo on blue, then dash through XR-9 into the back arc and sit on the panel.
    'xr-cheese-2loop': [[['go', 60, 200], ['go', 720, 200], ['go', 720, 300], ['end']],
        [['go', 60, 200], ['go', 500, 200], ['go', 500, 300], ['go', 470, 300], ['go', 400, 300, 1], ['wait', 100],
            ['go', 500, 300], ['go', 560, 300], ['go', 560, 550], ['go', 655, 550], ['sp'], ['go', 735, 535], ['sp'], ['wait', 60]]],
    // B6: dash west into the closed back door from (480,284).
    'k-d-east-door-dash': [[['go', 260, 200], ['go', 260, 295], ['end']],
        [['go', 600, 200], ['go', 520, 300], ['go', 400, 300, 1], ['hold', 'a', 40]]],
    'xr-cheese-front-walk': [[['go', 60, 200], ['go', 720, 200], ['go', 720, 300], ['end']],
        [['go', 60, 200], ['go', 500, 200], ['go', 500, 300], ['go', 470, 300], ['go', 420, 300], ['wait', 200]]],
};
export function runQaPlan(plan, onTick) {
    const dead = () => state.gameState !== 'PLAYING';
    const pc = () => ({ x: state.player.x + state.player.w / 2, y: state.player.y + state.player.h / 2 });
    for (const loop of plan) {
        const L0 = state.loopNumber;
        for (const s of loop) {
            if (dead()) break;
            if (s[0] === 'go') {
                for (let n = 0; n < 3000 && !dead() && state.loopNumber === L0; n++) {
                    const p = pc(); const dx = s[1] - p.x; const dy = s[2] - p.y;
                    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
                    tick({ x: dx > 2 ? 1 : (dx < -2 ? -1 : 0), y: dy > 2 ? 1 : (dy < -2 ? -1 : 0) }, s[3] ? ['shift'] : [], true);
                    if (onTick) onTick();
                    // both axes: tick() only sets one key per axis, which matches QA's driver
                }
            } else if (s[0] === 'hold') { for (let n = 0; n < s[2] && !dead(); n++) { tick({ x: s[1] === 'a' ? -1 : s[1] === 'd' ? 1 : 0, y: s[1] === 'w' ? -1 : s[1] === 's' ? 1 : 0 }, [], true); if (onTick) onTick(); } }
            else if (s[0] === 'wait') wait(s[1], true);
            else if (s[0] === 'sp') { tick({}, ['space'], true); tick({}, [], true); }
            else if (s[0] === 'end') { for (let n = 0; n < 4000 && !dead() && state.loopNumber === L0; n++) tick({}, [], true); }
        }
    }
    for (let i = 0; i < 120 && state.gameState === 'PLAYING'; i++) tick({}, [], true);
}

export function runNaive(which, arg) {
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
    const shieldLoop = () => { upTheBeam(36, true); wait(6, true); if (!state.failMessage) pressR(); };
    const pocketLoop = () => {
        upTheBeam(76, true);
        for (let i = 0; i < 600 && !shieldParked() && !state.failMessage; i++) tick({}, [], true);
        softMove(295, 76); wait(6, true); if (!state.failMessage) pressR();
    };
    const blueLoop = () => {
        softMove(40, 100);
        for (let i = 0; i < 900 && !shieldParked() && !state.failMessage; i++) tick({}, [], true);
        for (let i = 0; i < 1500 && !guardPinned() && !state.failMessage; i++) tick({}, [], true);
        softMove(40, 300); softMove(480, 300); softMove(480, 520); wait(6, true); if (!state.failMessage) pressR();
    };
    let haulNote = '', doorX = 0;
    const haul4 = (waitGuard, lateStart = 0) => {
        softMove(60, 300);
        tick({}, ['space'], true);
        tick({}, [], true);
        for (let i = 0; i < 900 && !shieldParked() && !state.failMessage; i++) tick({}, [], true);
        if (waitGuard) for (let i = 0; i < 1500 && !guardPinned() && !state.failMessage; i++) tick({}, [], true);
        softMove(525, 300);
        if (lateStart) waitTick(lateStart, true);
        for (let i = 0, last = state.currentTick; i < 2000 && state.player.x < 680 && !state.failMessage; i++) {
            tick({ x: 1 }, [], true);
            if (state.currentTick < last) { haulNote = `loop ran out at the shut door (x ${Math.round(doorX)})`; return; }
            last = state.currentTick; doorX = state.player.x;
        }
        tick({}, ['space'], true);
        wait(30, true);
    };
    const table = {
        'l4-control': () => {
            loadLevel({ level: levelIndex('W5-L4') });
            shieldLoop(); pocketLoop(); blueLoop(); haul4(true);
        },
        // Skip the decoy: shield, then blue, then haul straight past the guard.
        'l4-no-decoy': () => {
            loadLevel({ level: levelIndex('W5-L4') });
            shieldLoop(); blueLoop(); haul4(false);
        },

        // XR-9 with no decoy: blue rotates like the par route, but the courier
        // only ever meets the robot's front.
        'x9-frontal': () => {
            loadLevel({ level: levelIndex('W5-BOSS') });
            const slots = [XR9.Ta, XR9.Tb, XR9.Tc, XR9.Ta];
            xr9Plate(slots[0], true); tick({}, ['r'], true);
            for (let k = 0; k < 3 && state.gameState !== 'LEVEL_COMPLETE'; k++) {
                xr9Hit(slots[k], true); wait(10, true); xr9Retreat(true);
                xr9Plate(slots[k + 1], true); tick({}, ['r'], true);
            }
        },
        // Blue pressed before the decoy shows: XR-9 sights the plate holder first
        // and its aim is locked when the decoy appears.
        'x9-early-blue': () => {
            const { Ta, Tb, Tc } = XR9;
            loadLevel({ level: levelIndex('W5-BOSS') });
            xr9Bait(Ta, true); tick({}, ['r'], true);
            xr9Plate(Ta - 40, true); xr9Bait(Tb, true); tick({}, ['r'], true);
            xr9Hit(Ta, true); wait(10, true); xr9Retreat(true);
            xr9Plate(Tb - 40, true); xr9Bait(Tc, true); tick({}, ['r'], true);
            xr9Hit(Tb, true); wait(10, true); xr9Retreat(true);
            xr9Plate(Tc - 40, true); tick({}, ['r'], true);
            xr9Hit(Tc, true); wait(60, true);
        },
        // Blue recorded before the decoy: in loop 3 the newest echo is the decoy,
        // so nobody valid is on blue and the back door stays shut.
        'x9-wrong-order': () => {
            const { Ta, Tb } = XR9;
            loadLevel({ level: levelIndex('W5-BOSS') });
            xr9Plate(Ta, true); tick({}, ['r'], true);
            xr9Bait(Ta, true); xr9Bait(Tb, true); tick({}, ['r'], true);
            for (const t of [Ta, Tb, Ta]) {
                if (state.gameState === 'LEVEL_COMPLETE') break;
                xr9Hit(t, true); wait(10, true); xr9Retreat(true);
                xr9Plate(t === Ta ? Tb : Ta, true); tick({}, ['r'], true);
            }
        },
        // Compressed route: one decoy and one blue holder each work all three slots,
        // so a single courier loop tries all three hits.
        'x9-triple': () => {
            const { Ta, Tb, Tc } = XR9;
            loadLevel({ level: levelIndex('W5-BOSS') });
            xr9Bait(Ta, true); xr9Bait(Tb, true); xr9Bait(Tc, true); tick({}, ['r'], true);
            xr9Plate(Ta, true); xr9Plate(Tb, true); xr9Plate(Tc, true); tick({}, ['r'], true);
            for (const t of [Ta, Tb, Tc]) {
                if (state.gameState === 'LEVEL_COMPLETE') break;
                xr9Hit(t, true); wait(10, true); xr9Retreat(true);
            }
        },
        // QA B's 2-loop cheese and its front-walk control, replayed tick for tick.
        'x9-qa-cheese': () => { loadLevel({ level: levelIndex('W5-BOSS') }); runQaPlan(QA_XR9_PLANS['xr-cheese-2loop']); },
        'x9-qa-front-walk': () => { loadLevel({ level: levelIndex('W5-BOSS') }); runQaPlan(QA_XR9_PLANS['xr-cheese-front-walk']); },
        // One echo camps on blue all loop while another decoys all three slots.
        'x9-camp': () => {
            const { Ta, Tb, Tc } = XR9;
            loadLevel({ level: levelIndex('W5-BOSS') });
            xr9Bait(Ta, true); xr9Bait(Tb, true); xr9Bait(Tc, true); tick({}, ['r'], true);
            goNorth(705, true); moveTo(705, 285, 2, 300, true); wait(6, true); tick({}, ['r'], true);
            for (const t of [Ta, Tb, Tc]) {
                if (state.gameState === 'LEVEL_COMPLETE') break;
                xr9Hit(t, true); wait(10, true); xr9Retreat(true);
            }
        },
        // Skip the decoy and time the patrol: cross behind the guard while it walks north.
        'l4-sneak': (when = (gd) => gd.facingY < 0 && gd.y < 240) => {
            loadLevel({ level: levelIndex('W5-L4') });
            shieldLoop(); blueLoop();
            softMove(60, 300);
            tick({}, ['space'], true);
            tick({}, [], true);
            for (let i = 0; i < 900 && !shieldParked() && !state.failMessage; i++) tick({}, [], true);
            const g = () => state.guards[0];
            for (let i = 0; i < 2000 && !when(g()) && !state.failMessage; i++) tick({}, [], true);
            softMove(525, 300);
            for (let i = 0; i < 2000 && state.player.x < 680 && !state.failMessage; i++) tick({ x: 1 }, [], true);
            tick({}, ['space'], true);
            wait(30, true);
        },
        // Right jobs, wrong order: blue recorded before the decoy is no longer the newest.
        // Decoy recorded as if static were not there: it reaches the pocket in
        // time for the guard's second upward sweep on the clock it was recorded
        // on, but its beam climb replays at half speed, so it misses that sweep.
        // The guard is pinned a sweep later and the timed door has shut for good.
        'l4-ignore-static': (opts = {}) => {
            const start = opts.start ?? Number(process.env.L4LATE || 800);
            const lvl = LEVELS[levelIndex('W5-L4')];
            const saved = lvl.layout.statics;
            // Control only: the same inputs on L4 with its static removed (every rewind rebuilds the level).
            if (opts.noStatic) lvl.layout.statics = [];
            try {
                loadLevel({ level: levelIndex('W5-L4') });
                shieldLoop();
                softMove(40, 530); softMove(198, 530);
                waitTick(start, true);
                for (let i = 0; i < 400 && state.player.y > 77 && !state.failMessage; i++) tick({ y: -1 }, [], true);
                softMove(295, 76);
                wait(6, true); if (!state.failMessage) pressR();
                blueLoop(); haul4(true);
            } finally { lvl.layout.statics = saved; }
        },
        // Right echoes, but the courier dawdles past the door's one window.
        'l4-miss-window': () => {
            loadLevel({ level: levelIndex('W5-L4') });
            shieldLoop(); pocketLoop(); blueLoop(); haul4(true, 1780);
        },
        'l4-blue-middle': () => {
            loadLevel({ level: levelIndex('W5-L4') });
            shieldLoop(); blueLoop(); pocketLoop(); haul4(true);
        },
        // Decoy first: no shield yet, so the turn into the pocket is inside a live beam.
        'l4-decoy-first': () => {
            loadLevel({ level: levelIndex('W5-L4') });
            pocketLoop(); shieldLoop(); blueLoop(); haul4(true);
        },
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
    try { fn(arg); }
    catch (err) {
        // A naive route that walks into a shut door simply cannot go on.
        if (!/blocked|timed out/.test(err.message)) throw err;
        return { completed: false, state: state.gameState, tick: state.currentTick, loops: state.pastRuns.length, hp: state.robots?.[0]?.hp, fail: 'stuck: ' + err.message.split(' at ')[0] };
    }
    return {
        completed: state.gameState === 'LEVEL_COMPLETE',
        state: state.gameState,
        tick: state.currentTick,
        loops: state.pastRuns.length,
        hp: state.robots?.[0]?.hp,
        fail: state.failMessage || haulNote
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

/** QA key-script runner: loops of [keys ('d', 'shift+d', 'space', 'r', ''), ticks]. */
export function runKeyLoops(loops, tail = 300, onTick) {
    const dead = () => state.gameState !== 'PLAYING';
    for (const loop of loops) for (const [k, n] of loop) {
        const ks = k ? k.split('+') : [];
        for (let i = 0; i < n && !dead(); i++) {
            const dir = { x: ks.includes('d') ? 1 : ks.includes('a') ? -1 : 0, y: ks.includes('s') ? 1 : ks.includes('w') ? -1 : 0 };
            tick(dir, ks.filter(x => !'wasd'.includes(x)), true);
            if (onTick) onTick();
        }
    }
    for (let i = 0; i < tail && !dead(); i++) { tick({}, [], true); if (onTick) onTick(); }
}
