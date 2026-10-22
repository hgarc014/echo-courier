// 'Loudest wins' Sinkhole redesign: the Burrower hunts whoever most recently stepped onto
// a crack or plate; stillness is silent and noise fades (NOISE_TTL_TICKS). A stun needs the
// live courier on the core plate AND an echo stamping the struck crack within
// STAMP_WINDOW_TICKS. One stun per loop.
// Run: node tests/loudestWins.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main, state, keys, LEVELS, replaySolution } from './harness/replay.mjs';

const { Burrower, NOISE_TTL_TICKS, STAMP_WINDOW_TICKS } = await import('../src/entities/bosses/Burrower.js');
const { CrackedFloor } = await import('../src/entities/hazards.js');
const { PressurePlate } = await import('../src/entities/interactables.js');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}
function resetWorld() {
    state.bossCheckpoint = null; state.bossCheckpointLive = false; state.currentTick = 0;
    state.packages = []; state.doors = []; state.plates = []; state.cracks = []; state.burrowers = [];
}
const clear = () => { for (const k of Object.keys(keys)) keys[k] = false; };
const sol = JSON.parse(readFileSync(new URL('./solutions/w2-mb.json', import.meta.url), 'utf8'));
const sinkhole = LEVELS.findIndex(l => l.name === 'W2-MB: Sinkhole');

function start() {
    clear();
    main.startGame(sinkhole);
    for (let g = 0; g < 10 && state.gameState !== 'PLAYING'; g++) { keys.enter = true; main.stepSimulation(); keys.enter = false; main.stepSimulation(); }
    assert.equal(state.gameState, 'PLAYING');
}
function playFrames(frames) {
    for (const [k, n] of frames) {
        for (let i = 0; i < n; i++) { clear(); for (const key of k ? k.split('+') : []) keys[key] = true; main.stepSimulation(); }
    }
    clear();
}

check('no noise yet: the live courier is hunted and the first lock is on the courier', () => {
    start();
    main.stepSimulation();
    const ui = state.burrowers[0].getUiState();
    assert.equal(ui.targetKind, 'player');
    assert.equal(ui.huntKind, 'player');
    assert.equal(ui.huntByNoise, false);
    assert.equal(ui.huntLabel, 'hunting YOU (no noise yet)');
});

check('targeting follows the most recent noise (crack or plate), and the hunt label matches', () => {
    resetWorld();
    state.plates = [new PressurePlate('p', 200, 0, [])];
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast'), new CrackedFloor(400, 0, 40, 40, 'fast')];
    const boss = new Burrower(200, 300, { surfaceInterval: 3, telegraphTime: 1 });
    const player = { x: 100, y: 100, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 300, y: 100, w: 30, h: 30, isActive: true };
    const run = n => { for (let i = 0; i < n; i++) boss.update([player, echo]); };
    run(5);
    assert.equal(boss.getUiState().huntKind, 'player');
    player.x = 5; player.y = 5; run(5);                 // courier steps onto crack
    assert.equal(boss.getUiState().huntKind, 'player');
    assert.equal(boss.getUiState().huntByNoise, true);
    echo.x = 205; echo.y = 5; run(5);                   // echo steps onto the plate
    assert.equal(boss.getUiState().huntKind, 'echo');
    assert.equal(boss.getUiState().huntLabel, 'hunting ECHO 1 (noise)');
    player.x = 405; run(1);                              // courier steps onto the other crack
    assert.equal(boss.getUiState().huntKind, 'player');
    // Standing still makes no new noise, and old noise fades.
    run(NOISE_TTL_TICKS + 2);
    assert.equal(boss.getUiState().huntByNoise, false);
    assert.equal(boss.getUiState().huntLabel, 'hunting YOU (no noise yet)');
});

check('the next lock goes to the noisiest actor; the locked tile itself never drifts', () => {
    resetWorld();
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast'), new CrackedFloor(400, 0, 40, 40, 'fast'), new CrackedFloor(200, 200, 40, 40, 'fast')];
    const boss = new Burrower(200, 100, { surfaceInterval: 0.5, telegraphTime: 0.25 });
    const player = { x: 200, y: 120, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 400, y: 60, w: 30, h: 30, isActive: true };
    boss.update([player, echo]);
    const first = { ...boss.lockedTile };
    echo.x = 405; echo.y = 5;                            // echo makes noise mid-countdown
    let moved = false;
    for (let i = 0; i < 200 && boss.phase !== 'stun'; i++) {
        boss.update([player, echo]);
        if (boss.cycleLocked && boss.lockedTile && boss.phase === 'burrow' && boss.cycleTicks > 1 && (boss.lockedTile.x !== first.x) && boss.aimKind === 'player') moved = true;
        if (boss.aimKind === 'echo') break;
    }
    assert.equal(moved, false, 'locked tile moved inside the cycle');
    assert.equal(boss.aimKind, 'echo', 'the following lock went to the noisy echo');
    assert.equal(boss.lockedTile.x, 400);
});

check('parking an echo does NOT avoid strikes: a still echo is silent and the courier is hunted', () => {
    start();
    // Loop 1: walk next to c1's ring without stepping on it, then stand still (park).
    playFrames([['a', 30], ['w', 60], ['', 30], ['r', 1]]);
    assert.equal(state.activeGhosts.length, 1);
    const locks = [];
    for (let i = 0; i < 1200 && state.gameState === 'PLAYING'; i++) {
        main.stepSimulation();
        const b = state.burrowers[0];
        if (b.cycleLocked && b.lockedTile && b.cycleTicks === 1) locks.push(b.aimKind);
    }
    assert.ok(locks.length >= 4, `saw ${locks.length} locks`);
    assert.deepEqual([...new Set(locks)], ['player'], `locks went to ${locks.join(',')}`);
});

check('an echo stamp without the courier on the plate does not stun', () => {
    // Loop 1 of the recorded route is the stamper; then the courier idles at spawn.
    start();
    playFrames(sol.loops[0]);
    assert.equal(state.activeGhosts.length, 1);
    for (let i = 0; i < 300; i++) main.stepSimulation();
    assert.equal(state.burrowers[0].hp, 3);
});

check('one stun per loop: after the stun the boss sleeps, later stamps do nothing until rewind', () => {
    start();
    playFrames(sol.loops[0]);
    playFrames(sol.loops[1].filter(([k]) => k !== 'r'));
    const b = state.burrowers[0];
    assert.equal(b.hp, 2, 'stun 1 landed');
    for (let i = 0; i < 1200 && state.gameState === 'PLAYING'; i++) main.stepSimulation();
    assert.equal(b.hp, 2);
    assert.equal(b.stunsThisLoop, 1);
    assert.equal(b.phase, 'dormant');
});

check('a stamp too early (outside the stamp window) does not count', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 40, 0, [])];
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast')];
    const boss = new Burrower(200, 200, { surfaceInterval: 1, telegraphTime: 0.5, corePlateIds: ['c1'] });
    const player = { x: 45, y: 5, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 5, y: 5, w: 30, h: 30, isActive: true };
    // The echo stands on the crack from tick 1: by the strike (tick 90) its stamp is stale.
    for (let i = 0; i < 95; i++) boss.update([player, echo]);
    assert.ok(STAMP_WINDOW_TICKS < 90);
    assert.equal(boss.hp, 3);
});

check('recorded route clears in 4 loops at par 4', () => {
    const r = replaySolution(sol);
    assert.equal(r.completed, true);
    assert.equal(r.loopsUsed, 4);
    assert.equal(r.par, 4);
});

// ---- QA C on PR #57 (design) ----

// Boss with an echo lure: the echo's step onto crack k (tick 1) is the newest noise
// at the first lock, so the lock is k. The echo then waits off the floor and steps
// back onto k `lead` ticks before the strike (lead 1 = the strike tick itself).
function stampRun(lead, { courierOnPlate = true } = {}) {
    resetWorld();
    const core = new PressurePlate('c1', 80, 80, []);
    state.plates = [core];
    const k = new CrackedFloor(80, 120, 40, 40, 'fast');
    state.cracks = [k];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1, corePlateIds: ['c1'], maxStunsPerLoop: 1 });
    state.burrowers = [boss];
    const player = { x: courierOnPlate ? 85 : 300, y: courierOnPlate ? 85 : 200, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 85, y: 125, w: 30, h: 30, isActive: true };
    const strikeAt = boss.intervalTicks() + boss.telegraphTicks();
    const log = { feedback: null, crackBeforeStrike: null };
    for (let t = 1; t <= strikeAt + 2; t++) {
        if (t === 2) { echo.x = 200; echo.y = 125; }
        if (t === strikeAt - lead + 1) { echo.x = 85; echo.y = 125; }
        if (t === strikeAt) log.crackBeforeStrike = { collapsing: k.collapsing, broken: k.broken };
        boss.update([player, echo]);
        k.update([player, echo]);
        if (boss.feedback && !log.feedback) log.feedback = boss.feedback.text;
    }
    return { boss, k, log };
}

check('stamp window is exactly 0.5 s (30 ticks): a stamp 30 ticks out stuns, 31 ticks out is TOO EARLY', () => {
    assert.equal(STAMP_WINDOW_TICKS, 30);
    const ok = stampRun(30);
    assert.equal(ok.boss.hp, 2, 'stamp inside the window stuns');
    assert.equal(ok.log.feedback, 'STAMP OK');
    const late = stampRun(1);
    assert.equal(late.boss.hp, 2, 'stamp on the strike tick stuns');
    const early = stampRun(31);
    assert.equal(early.boss.hp, 3, 'stamp outside the window does not stun');
    assert.equal(early.log.feedback, 'TOO EARLY');
});

check('an early stamp keeps the locked crack intact until the strike (no crumble, no early fire)', () => {
    const early = stampRun(55);
    assert.deepEqual(early.log.crackBeforeStrike, { collapsing: false, broken: false });
    assert.equal(early.k.collapsing || early.k.broken, true, 'the strike itself collapses it');
    assert.equal(early.boss.hp, 3);
});

check('STAMP OK without the courier on the core plate says so and does not stun', () => {
    const r = stampRun(10, { courierOnPlate: false });
    assert.equal(r.boss.hp, 3);
    assert.equal(r.log.feedback, 'STAMP OK · hold the CORE plate');
});

check('a diagonal (corner) entry that loads a crack is also a noise', () => {
    resetWorld();
    const k = new CrackedFloor(40, 40, 40, 40, 'fast');
    state.cracks = [k];
    const boss = new Burrower(300, 300, {});
    const echo = { id: 0, runData: [], x: 0, y: 0, w: 30, h: 30, isActive: true };
    boss.update([echo]);
    // Corner overlap only: centre (29,29) is outside the tile, the box overlaps it.
    echo.x = 14; echo.y = 14;
    boss.update([echo]);
    const free = new CrackedFloor(40, 40, 40, 40, 'fast');
    free.update([echo]);
    assert.equal(free.warningCommitted, true, 'an unlocked crack takes that weight');
    const n = boss.noise.get('echo:0');
    assert.ok(n && n.surface === 'k40,40', 'and the step is heard');
});

check('player-mode label: one STRIKES label on the courier tile, no stacked hunting label', () => {
    start();
    main.stepSimulation();
    const b = state.burrowers[0];
    assert.equal(b.playerMode, true);
    const calls = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'fillText' ? (t) => calls.push(t) : () => {})), set: () => true });
    b.render(ctx);
    assert.ok(calls.includes('STRIKES YOUR TILE'));
    assert.ok(!calls.some(t => /^hunting /.test(t)), `hunt label drawn too: ${calls.join(' | ')}`);
});

check("hint no longer says 'Step off fast'; it says stay ON the crack", () => {
    const lvl = LEVELS[sinkhole];
    assert.doesNotMatch(lvl.hintLine, /Step off fast/);
    assert.match(lvl.hintLine, /staying ON it/);
    assert.ok(lvl.hintLine.length < 200, 'short hint');
});

check('loop 1 shows the REC stamp cue on cracks beside core plates; later loops do not', () => {
    start();
    const b = state.burrowers[0];
    const draw = () => {
        const calls = [];
        const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'fillText' ? (t) => calls.push(t) : () => {})), set: () => true });
        b.drawRecordCue(ctx);
        return calls.filter(t => t === 'REC stamp').length;
    };
    assert.equal(draw(), 12);
    state.pastRuns = [[]];
    assert.equal(draw(), 0);
    state.pastRuns = [];
});

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('loudest wins checks passed');
