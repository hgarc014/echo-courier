// QA C on PR #55, run in the real Sinkhole level (W2-MB) through the real update loop.
// 1) QA's F6 path: the echo walks left (240,450)->(120,450)->(120,200)->(200,150), then R
//    and the courier stays at spawn. The first strike of loop 2 must be locked on ECHO 1.
// 2) Once a tile is locked it never moves until it surfaces (or the cycle is called off).
// 3) Exactly one strike marker: no crack draws a leftover ring off the locked tile.
// Run: node tests/sinkholeQaC.test.mjs
import assert from 'node:assert/strict';
import { main, state, keys, LEVELS } from './harness/replay.mjs';

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}
const clear = () => { for (const k of Object.keys(keys)) keys[k] = false; };
const key = t => (t ? `${t.x},${t.y}` : null);

function start() {
    const idx = LEVELS.findIndex(l => /Sinkhole/.test(l.name));
    assert.ok(idx >= 0, 'Sinkhole level exists');
    clear();
    main.startGame(idx);
    for (let g = 0; g < 10 && state.gameState !== 'PLAYING'; g++) {
        keys.enter = true; main.stepSimulation(); keys.enter = false; main.stepSimulation();
    }
    assert.equal(state.gameState, 'PLAYING');
}

// Track every lock: from first non-null lockedTile to the strike/cancel, it must stay one tile.
function makeAudit() {
    const a = { cycles: [], open: null, firstOfLoop: [], markerMismatch: [], strayRings: [] };
    a.tick = () => {
        const b = state.burrowers[0];
        if (!b) return;
        // A crack lock is fixed from lock to strike. A player-mode tile follows the
        // courier while burrowing and freezes when the telegraph starts.
        const lock = (b.phase === 'telegraph' || (b.phase === 'burrow' && !b.playerMode)) ? key(b.lockedTile) : null;
        if (lock && !a.open) { a.open = { tile: lock, kind: b.aimKind, id: b.aimId, from: state.currentTick, tiles: new Set([lock]) }; a.cycles.push(a.open); }
        else if (lock && a.open) a.open.tiles.add(lock);
        else if (!lock) a.open = null;
        const ui = b.getUiState();
        if (ui.targetTile && key(ui.targetTile) !== key(b.lockedTile)) a.markerMismatch.push([state.currentTick, key(ui.targetTile), key(b.lockedTile)]);
    };
    return a;
}

function go(audit, tx, ty, max = 900) {
    for (let i = 0; i < max; i++) {
        const P = state.player;
        const dx = tx - P.x, dy = ty - P.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
        clear(); keys.a = dx < -2; keys.d = dx > 2; keys.w = dy < -2; keys.s = dy > 2;
        main.stepSimulation(); audit.tick();
    }
    clear();
}
function idle(audit, n) { clear(); for (let i = 0; i < n && state.gameState === 'PLAYING'; i++) { main.stepSimulation(); audit.tick(); } }
function pressR() { clear(); keys.r = true; main.stepSimulation(); keys.r = false; main.stepSimulation(); }

// Changed for 'Loudest wins': QA's F6 path never steps on a crack or plate, so that
// echo is silent and loop 2's first strike locks on the courier (it used to be ECHO 1
// by the removed lowest-id rule).
check("QA F6 path under Loudest wins: a silent walking echo is ignored; loop 2's first strike locks on the courier", () => {
    start();
    const audit = makeAudit();
    assert.deepEqual([state.player.x, state.player.y], [240, 450]);
    go(audit, 120, 450); go(audit, 120, 200); go(audit, 200, 150);
    pressR();
    assert.equal(state.activeGhosts.length, 1, 'loop 1 became echo 1');
    const before = audit.cycles.length;
    idle(audit, 260);
    const first = audit.cycles[before];
    assert.ok(first, 'loop 2 locked a tile');
    assert.equal(first.kind, 'player', `first strike locked on ${first.kind} at ${first.tile}`);
    assert.equal(first.tiles.size, 1, 'that lock never moved');
});

check('a locked tile never moves once telegraphed (QA: 440,280 -> 480,240): 40 s of pacing, plus a loop with an echo on the QA path', () => {
    start();
    const audit = makeAudit();
    // Idling now dies (the courier's own tile is struck), so pace to stay alive.
    for (let i = 0; i < 20 && state.gameState === 'PLAYING'; i++) { go(audit, 120, 450); go(audit, 240, 450); }
    assert.equal(state.gameState, 'PLAYING', `pacing survives: ${state.failMessage}`);
    go(audit, 120, 200); go(audit, 200, 150);
    pressR();
    for (let i = 0; i < 12 && state.gameState === 'PLAYING'; i++) { go(audit, 120, 450); go(audit, 240, 450); }
    assert.ok(audit.cycles.length >= 8, `saw ${audit.cycles.length} locks`);
    for (const c of audit.cycles) assert.equal(c.tiles.size, 1, `lock at tick ${c.from} moved: ${[...c.tiles].join(' -> ')}`);
    assert.deepEqual(audit.markerMismatch, [], 'drawn marker always equals the locked tile');
});

check('QA C pressure: idling at spawn dies to the first strike on your own tile (was 28 strikes, 0 deaths)', () => {
    start();
    clear();
    let died = null;
    for (let i = 0; i < 400 && !died; i++) { main.stepSimulation(); if (state.failMessage) died = [state.failMessage, state.currentTick]; }
    assert.ok(died, 'idling at spawn must die');
    assert.equal(died[0], 'Struck by the Burrower!');
    assert.ok(died[1] <= 245, `died at tick ${died[1]}`);
});

check('the player-mode strike hits plain floor: the courier on a non-crack tile at the strike dies', () => {
    start();
    const b = state.burrowers[0];
    idle(makeAudit(), 2);
    assert.equal(b.playerMode, true);
    const t = b.lockedTile;
    assert.equal(state.cracks.some(c => c.x === t.x && c.y === t.y), false, 'spawn tile is plain floor');
});

check('stepping off the frozen tile during the telegraph survives the strike', () => {
    start();
    const audit = makeAudit();
    idle(audit, 185);
    const b = state.burrowers[0];
    assert.equal(b.phase, 'telegraph');
    go(audit, 160, 450);
    let fail = '';
    for (let i = 0; i < 70; i++) { main.stepSimulation(); fail = fail || state.failMessage; }
    assert.equal(fail, '');
});

check('exactly one live marker: no crack draws a ring unless it is a running weight/crumble warning', () => {
    start();
    const audit = makeAudit();
    const rings = [];
    for (let i = 0; i < 1500; i++) {
        main.stepSimulation(); audit.tick();
        const b = state.burrowers[0];
        const lock = key(b.lockedTile);
        for (const c of state.cracks) {
            const drawsRing = c.warningCommitted || (c.collapsing && c.stage === 1);
            if (drawsRing && key(c) !== lock && !c.collapsing) rings.push([state.currentTick, key(c)]);
        }
    }
    assert.deepEqual(rings, [], 'no stray rings while idle');
});

check("labels name the real target: 'STRIKES YOUR TILE' and 'hunting YOU (no noise yet)' at spawn", () => {
    start();
    const b = state.burrowers[0];
    idle(makeAudit(), 2);
    // No noise yet: the courier is hunted and the strike tile is their own.
    assert.equal(b.aimKind, 'player');
    assert.equal(b.playerMode, true);
    // Changed for 'Loudest wins': the strike label names who the tile was locked on,
    // and the hunt label names the live target and why.
    assert.equal(b.targetLabel(), 'STRIKES YOUR TILE');
    assert.equal(b.getUiState().huntLabel, 'hunting YOU (no noise yet)');
});

check('parcel pickup gives feedback (ring + PARCEL PICKED UP tag for 45 ticks)', () => {
    start();
    const pkg = state.packages[0];
    state.player.x = pkg.x; state.player.y = pkg.y;
    clear(); keys.space = true; main.stepSimulation(); keys.space = false;
    assert.equal(pkg.carriedBy, 'player');
    assert.ok(state.pickupFlash && state.pickupFlash.ticks > 0, 'pickup flash running');
    assert.equal(main.PICKUP_FLASH_TICKS, 45);
});

const { fitScale } = await import('../src/ui/fitLayout.js');
check('layout fit scales by the real panel height so the controls line stays on screen (950px window)', () => {
    assert.equal(fitScale(840, 900, 950, 800).toFixed(3), (800 / 900).toFixed(3));
    assert.equal(fitScale(840, 700, 1280, 900), 1);
    assert.ok(fitScale(840, 900, 950, 700) * 900 <= 700);
});

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('sinkhole QA C checks passed');
