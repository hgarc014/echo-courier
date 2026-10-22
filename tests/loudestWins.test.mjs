// 'Loudest wins' Sinkhole redesign: the Burrower hunts whoever most recently stepped onto
// a crack or plate; stillness is silent and noise fades (NOISE_TTL_TICKS). A stun needs the
// live courier on the core plate AND an echo stamping the struck crack within
// STAMP_WINDOW_TICKS. One stun per loop.
// Run: node tests/loudestWins.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main, state, keys, LEVELS, replaySolution } from './harness/replay.mjs';

const { Burrower, NOISE_TTL_TICKS, STAMP_WINDOW_TICKS, STAMP_ACCEPT_TICKS, FEEDBACK_TICKS, EARLY_TICKS } = await import('../src/entities/bosses/Burrower.js');
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
    const boss = new Burrower(200, 200, { surfaceInterval: 2, telegraphTime: 0.5, corePlateIds: ['c1'] });
    const player = { x: 45, y: 5, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 5, y: 5, w: 30, h: 30, isActive: true };
    // The echo stands on the crack from tick 1: by the strike (tick 150) its stamp is stale.
    for (let i = 0; i < 155; i++) boss.update([player, echo]);
    // (the window is 90 ticks; the echo stood still from tick 1, so no fresh step)
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
function stampRun(lead, { courierOnPlate = true, spentEchoes = [] } = {}) {
    resetWorld();
    const core = new PressurePlate('c1', 80, 80, []);
    state.plates = [core];
    const k = new CrackedFloor(80, 120, 40, 40, 'fast');
    state.cracks = [k];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1, corePlateIds: ['c1'], maxStunsPerLoop: 1 });
    state.burrowers = [boss];
    boss.spentEchoIds = [...spentEchoes];
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

// stampRun's lead counts the strike tick as 1, so lead L enters with L-1 ticks left on
// the clock (the QA 'entry' reading). Readings 45..1 (and the strike tick) stun; 46 does not.
check('the stun window is exactly the advertised 1.5 s (90 ticks): entry at 90 left ok, 91 TOO EARLY', () => {
    assert.equal(STAMP_WINDOW_TICKS, 90);
    assert.equal(STAMP_ACCEPT_TICKS, 90);
    const cue = stampRun(90);
    assert.equal(cue.boss.hp, 2);
    const ok = stampRun(91);
    assert.equal(ok.boss.hp, 2, 'stamp inside the window stuns');
    assert.equal(ok.log.feedback, 'STAMP OK');
    const late = stampRun(1);
    assert.equal(late.boss.hp, 2, 'stamp on the strike tick stuns');
    const early = stampRun(92);
    assert.equal(early.boss.hp, 3, 'stamp outside the window does not stun');
    assert.equal(early.log.feedback, 'TOO EARLY');
});

check('an early stamp keeps the locked crack intact until the strike (no crumble, no early fire)', () => {
    const early = stampRun(130);
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
    assert.match(lvl.hintLine, /any crack beside that plate in the last 1\.5 s/);
    assert.ok(lvl.hintLine.length < 240, 'short hint');
});

check('loop 1 shows the REC stamp cue on the lit core plate only; later loops do not', () => {
    start();
    const b = state.burrowers[0];
    const draw = () => {
        const calls = [];
        const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'fillText' ? (t) => calls.push(t) : () => {})), set: () => true });
        b.drawRecordCue(ctx);
        return calls.filter(t => t === 'REC stamp').length;
    };
    assert.equal(draw(), 1);
    state.pastRuns = [[]];
    assert.equal(draw(), 0);
    state.pastRuns = [];
});

function recCtx() {
    const calls = [];
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'fillText' ? (t) => calls.push(t) : () => {})), set: () => true });
    return { ctx, calls };
}

check('no trap after a missed stun: each core ring leaves plain floor, and walking off after the ring breaks survives', () => {
    for (const id of ['c1', 'c2', 'c3']) {
        start();
        const plate = state.plates.find(p => p.id === id);
        const sides = [[plate.x - 40, plate.y], [plate.x + 40, plate.y], [plate.x, plate.y - 40], [plate.x, plate.y + 40]];
        const open = sides.filter(([x, y]) => !state.cracks.some(c => c.x === x && c.y === y));
        assert.ok(open.length >= 1, `${id} ring has no gap`);
    }
    // Courier on c3, every ring crack broken (as after a missed stun): walk east and live.
    start();
    const c3 = state.plates.find(p => p.id === 'c3');
    for (const c of state.cracks) if (Math.abs(c.x - c3.x) + Math.abs(c.y - c3.y) === 40) { c.broken = true; c.stage = 4; }
    state.player.x = c3.x + 5; state.player.y = c3.y + 5;
    let fail = '';
    for (let i = 0; i < 40; i++) { clear(); keys.d = true; main.stepSimulation(); fail = fail || state.failMessage; }
    for (let i = 0; i < 20; i++) { clear(); keys.s = true; main.stepSimulation(); fail = fail || state.failMessage; }
    clear();
    assert.equal(fail, '', 'walked off the plate through the gap');
    assert.ok(state.player.x > c3.x + 40, 'left the plate eastward');
});

check('the strike countdown is the last thing drawn (never under the boss or the !)', () => {
    start();
    main.stepSimulation();
    const b = state.burrowers[0];
    const { ctx, calls } = recCtx();
    b.render(ctx);
    assert.match(calls[calls.length - 1], /^\d+\.\ds$/, `last text drawn: ${calls[calls.length - 1]}`);
    const iBang = calls.lastIndexOf('!');
    assert.ok(iBang >= 0 && iBang < calls.length - 1, "'!' is drawn before the countdown");
});

check("STAMP NOW pulses in the last 0.75 s of a strike on the live courier, and not earlier", () => {
    start();
    const b = state.burrowers[0];
    let sawEarly = false;
    let sawCue = false;
    // Pace so the courier survives; watch the first strike.
    for (let i = 0; i < 245 && !state.failMessage; i++) {
        clear(); keys.d = (i % 80) < 40; keys.a = !keys.d; main.stepSimulation();
        const { ctx, calls } = recCtx();
        b.drawStampCue(ctx);
        const cue = calls.includes('STAMP NOW');
        const left = b.ticksToStrike();
        if (cue) { sawCue = true; assert.ok(left >= 1 && left <= STAMP_WINDOW_TICKS, `cue with ${left} ticks left`); }
        if (!cue && b.phase === 'telegraph' && left != null && left >= 1 && left <= STAMP_WINDOW_TICKS && b.playerMode) sawEarly = true;
    }
    assert.equal(sawCue, true, 'cue appeared');
    assert.equal(sawEarly, false, 'cue on for the whole window');
});

check('during replay a ghost marker shows when the echo will stamp, and that it is in the window', () => {
    // Recorded route: loop 1 is the stamper; loop 2's lock is on ECHO 1.
    const loop1 = sol.loops[0];
    replaySolution({ ...sol, loops: [loop1] }, { extraTicks: 0 });
    clear();
    assert.equal(state.activeGhosts.length, 1, 'loop 1 became echo 1');
    let pred = null;
    for (let i = 0; i < 470 && !pred && !state.failMessage; i++) {
        clear(); keys.d = (i % 80) < 40; keys.a = !keys.d; main.stepSimulation();
        const b = state.burrowers[0];
        if (b.lockedTile && !b.playerMode) pred = b.predictedStamp();
    }
    assert.ok(pred, 'prediction while locked on the echo');
    assert.equal(pred.inWindow, true);
    const { ctx, calls } = recCtx();
    state.burrowers[0].drawStampCue(ctx);
    assert.ok(calls.some(t => /^ECHO 1 stamps .*✓$/.test(t)), calls.join(' | '));
});

// Player mode: the courier holds the core plate (its noise makes it the target);
// a silent echo steps onto a crack beside the plate `lead` ticks before the strike.
function playerModeRun(lead, { ghost = false } = {}) {
    resetWorld();
    const core = new PressurePlate('c1', 80, 80, []);
    state.plates = [core];
    const k = new CrackedFloor(80, 120, 40, 40, 'fast');
    state.cracks = [k];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1, corePlateIds: ['c1'], maxStunsPerLoop: 1 });
    state.burrowers = [boss];
    const player = { x: 85, y: 85, w: 30, h: 30 };
    state.player = player;
    const strikeAt = boss.intervalTicks() + boss.telegraphTicks();
    const runData = [];
    for (let t = 0; t <= strikeAt + 5; t++) runData.push(t >= strikeAt - lead + 1 ? { x: 85, y: 125 } : { x: 200, y: 125 });
    const echo = { id: 0, runData, x: 200, y: 125, w: 30, h: 30, isActive: true };
    state.activeGhosts = ghost ? [echo] : [];
    const log = { labels: [], pred: null, modes: [], feedback: null, crackBeforeStrike: null, after: null };
    for (let t = 1; t <= strikeAt + 2; t++) {
        state.currentTick = t;
        const s = runData[t]; echo.x = s.x; echo.y = s.y;
        if (t === strikeAt) log.crackBeforeStrike = { collapsing: k.collapsing, broken: k.broken };
        boss.update([player, echo]);
        k.update([player, echo]);
        log.modes.push(boss.playerMode);
        if (boss.phase === 'telegraph') log.labels.push(boss.targetLabel());
        if (boss.feedback && !log.feedback) log.feedback = boss.feedback.text;
        if (ghost && boss.phase === 'telegraph' && !log.pred) log.pred = boss.predictedStamp();
    }
    return { boss, k, log, failed: !!boss.strikeFail };
}

check('player-mode strike: courier on the CORE plate + echo stamping a crack beside it stuns (no death)', () => {
    const r = playerModeRun(20);
    assert.ok(r.log.modes.some(Boolean), 'strike was aimed at the courier');
    assert.equal(r.boss.hp, 2);
    assert.equal(r.failed, false);
    const miss = playerModeRun(150);
    assert.equal(miss.boss.hp, 3);
});

check('ghost marker keys off the stamp cracks beside the core plate in player mode', () => {
    const r = playerModeRun(20, { ghost: true });
    assert.ok(r.log.pred, 'prediction while the boss targets the courier');
    assert.equal(r.log.pred.inWindow, true);
    assert.deepEqual(r.log.pred.tile, { x: 80, y: 120, w: 40, h: 40 });
});

check('only one target label at a time: hunt label hidden while a strike label shows', () => {
    resetWorld();
    const core = new PressurePlate('c1', 80, 80, []);
    state.plates = [core];
    state.cracks = [new CrackedFloor(400, 400, 40, 40, 'fast')];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1, corePlateIds: ['c1'] });
    state.burrowers = [boss];
    const player = { x: 85, y: 85, w: 30, h: 30 };
    const echo = { id: 0, runData: [], x: 405, y: 405, w: 30, h: 30, isActive: true };
    for (let t = 1; t < boss.intervalTicks() + 20; t++) {
        state.currentTick = t;
        if (t === boss.intervalTicks() + 10) { echo.x = 405; echo.y = 405; }
        if (t === boss.intervalTicks() + 5) { echo.x = 600; }
        boss.update([player, echo]);
        if (!boss.targetLabel()) continue;
        const { ctx, calls } = recCtx();
        boss.drawHunt(ctx);
        assert.ok(!calls.some(c => /^hunting /.test(c)), calls.join(' | '));
    }
});


// ---- QA C (round 3) on PR #57 ----

check('player-hunt path: an early stamp shows TOO EARLY, keeps the crack intact, no silent death', () => {
    const r = playerModeRun(150);
    assert.equal(r.boss.hp, 3);
    assert.equal(r.log.feedback, 'TOO EARLY');
    assert.deepEqual(r.log.crackBeforeStrike, { collapsing: false, broken: false });
    assert.equal(r.failed, false, 'courier on the core plate is not killed');
});

check('player-hunt path: window is 90 ticks there too (entry at 90 left stuns, 91 TOO EARLY)', () => {
    assert.equal(playerModeRun(91).boss.hp, 2);
    const e = playerModeRun(92);
    assert.equal(e.boss.hp, 3);
    assert.equal(e.log.feedback, 'TOO EARLY');
});

check("while the courier must hold, the plate label says 'HOLD — echo stamps now', never 'MOVE!'", () => {
    const r = playerModeRun(20);
    const labels = r.log.labels.filter(Boolean);
    assert.ok(labels.some(l => /^HOLD/.test(l)), labels.join(' | '));
    assert.ok(!labels.some(l => /MOVE/.test(l)), labels.join(' | '));
});

check('STAMP NOW pulses only on the lit ring, not on spent or unlit plates', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 80, 80, []), new PressurePlate('c2', 400, 80, [])];
    const k1 = new CrackedFloor(80, 120, 40, 40, 'fast'); const k2 = new CrackedFloor(400, 120, 40, 40, 'fast');
    state.cracks = [k1, k2];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1, corePlateIds: ['c2', 'c1'] });
    state.burrowers = [boss];
    const player = { x: 405, y: 85, w: 30, h: 30 };
    let seen = false;
    for (let t = 1; t < boss.intervalTicks() + boss.telegraphTicks(); t++) {
        state.currentTick = t;
        boss.update([player]);
        if (!boss.stampNowActive()) continue;
        seen = true;
        const rects = [];
        const ctx = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : (key === 'strokeRect' ? (x, y) => rects.push([x, y]) : () => {})), set: () => true });
        boss.drawStampCue(ctx);
        assert.ok(rects.some(([x]) => x === 402), 'lit ring pulses');
        assert.ok(!rects.some(([x]) => x === 82), 'unlit ring does not');
    }
    assert.ok(seen, 'cue shown');
});

check('the countdown never sits on the echo marker text', () => {
    const boss = new Burrower(300, 300, {});
    boss._predLabel = { x: 100, y: 92 };
    boss._countdown = { text: '0.5s', x: 100, y: 96 };
    const at = [];
    const ctx = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : (key === 'fillText' ? (t, x, y) => at.push(y) : () => {})), set: () => true });
    boss.drawCountdown(ctx);
    assert.ok(at.length && at.every(y => Math.abs(y - 92) >= 16), `countdown y ${at}`);
});

check('after a stun the label drops the player-hunt HOLD target and tracks the true target', () => {
    const r = playerModeRun(20);
    assert.equal(r.boss.hp, 2);
    for (let i = 0; i < 200 && r.boss.phase === 'stun'; i++) { state.currentTick++; r.boss.update([]); }
    assert.equal(r.boss.playerMode, false);
    assert.doesNotMatch(String(r.boss.targetLabel() || ''), /HOLD|STRIKES YOUR TILE/);
});

check('each stun spends the lit plate: one loop-1 echo cannot stun twice', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 80, 80, []), new PressurePlate('c2', 400, 80, [])];
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast'), new CrackedFloor(400, 120, 40, 40, 'fast')];
    const boss = new Burrower(300, 300, { corePlateIds: ['c1', 'c2'] });
    assert.deepEqual(boss.liveCoreIds(), ['c1']);
    boss.stunPlateId = 'c1';
    boss.applyStun();
    assert.deepEqual(boss.liveCoreIds(), ['c2'], 'next plate lit after a stun');
    boss.rememberCheckpoint();
    state.bossCheckpointLive = true;
    const again = new Burrower(300, 300, { corePlateIds: ['c1', 'c2'] });
    assert.deepEqual(again.liveCoreIds(), ['c2'], 'spent plate survives the rewind');
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check('the recorded route stuns from a different core plate each loop', () => {
    const r = replaySolution(sol);
    assert.equal(r.completed, true);
    const b = state.burrowers[0];
    assert.deepEqual([...(b.spentPlateIds || [])].sort(), ['c1', 'c2', 'c3']);
});


check('retired core plates are drawn greyed with a USED tag; the lit plate is not', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 80, 80, []), new PressurePlate('c2', 400, 80, [])];
    const boss = new Burrower(300, 300, { corePlateIds: ['c1', 'c2'] });
    const draw = () => {
        const fills = []; const texts = [];
        const ctx = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : key === 'fillRect' ? (x, y) => fills.push([x, y]) : key === 'fillText' ? (tx) => texts.push(tx) : () => {}), set: () => true });
        boss.drawRetiredPlates(ctx);
        return { fills, texts };
    };
    assert.deepEqual(draw().texts, []);
    boss.stunPlateId = 'c1'; boss.applyStun();
    const d = draw();
    assert.ok(d.fills.some(([x, y]) => x === 80 && y === 80), 'c1 dimmed');
    assert.ok(!d.fills.some(([x]) => x === 400), 'lit c2 not dimmed');
    assert.ok(d.texts.includes('USED'));
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check('a single echo can never stun twice: a spent echo stamping in the window does nothing and says so', () => {
    const fresh = stampRun(30);
    assert.equal(fresh.boss.hp, 2);
    assert.deepEqual(fresh.boss.spentEchoIds, [0], 'the stamping echo is spent');
    const again = stampRun(30, { spentEchoes: [0] });
    assert.equal(again.boss.hp, 3, 'spent echo cannot stun');
    assert.notEqual(again.log.feedback, 'STAMP OK', 'a spent echo is silent');
    assert.equal(again.boss.noise.has('echo:0'), false, 'spent echo makes no noise');
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check('spent echoes survive the checkpoint (rewind)', () => {
    const r = stampRun(30);
    const cp = state.bossCheckpoint && Object.values(state.bossCheckpoint)[0];
    assert.deepEqual(cp && cp.echoes, [0]);
    void r; state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check('TOO EARLY covers stamps up to 1.5 s before the strike, shows >= 1 s, and is repeated on LOOP FAILED', () => {
    assert.ok(FEEDBACK_TICKS >= 60);
    assert.equal(EARLY_TICKS, 180);
    for (const lead of [92, 130, 181]) {
        const r = stampRun(lead);
        assert.equal(r.boss.hp, 3);
        assert.equal(r.log.feedback, 'TOO EARLY', 'lead ' + lead);
        assert.equal(state.burrowerFailNote, 'TOO EARLY');
    }
});

check('after a stun the noise is reset so the next lock is fresh', () => {
    const r = stampRun(30);
    assert.equal(r.boss.hp, 2);
    assert.equal(r.boss.noise.size, 0);
    assert.ok(!r.boss.hunt || r.boss.hunt.byNoise === false, 'no stale noise hunt');
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check('the lit core plate always has a pulsing outline', () => {
    resetWorld();
    state.plates = [new PressurePlate('c1', 80, 80, []), new PressurePlate('c2', 400, 80, [])];
    const boss = new Burrower(300, 300, { corePlateIds: ['c1', 'c2'] });
    const outline = (tick) => {
        state.currentTick = tick;
        const rects = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'strokeRect' ? (x, y) => rects.push([x, y]) : () => {}), set: () => true });
        boss.drawRetiredPlates(ctx);
        return { rects, pulse: boss._litPulse };
    };
    const a = outline(0), b = outline(13);
    assert.ok(a.rects.some(([x, y]) => x === 78 && y === 78), 'c1 outlined');
    assert.notEqual(a.pulse, b.pulse, 'outline pulses');
    state.currentTick = 0;
});

check('hunting label is hidden during the stun', () => {
    const r = stampRun(30);
    assert.equal(r.boss.phase, 'stun');
    const { ctx, calls } = recCtx();
    r.boss.hunt = { x: 85, y: 85, w: 30, h: 30, kind: 'player', id: 'player', byNoise: false };
    r.boss.drawHunt(ctx);
    assert.ok(!calls.some(t => /hunting/i.test(t)));
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

// ---- QA C (round 5) on PR #57 ----

check('recorded route: every strike that stuns had STAMP NOW at least 1.5 s (89+ ticks) before it', () => {
    const leads = []; let first = null; let lastHp = 3;
    replaySolution(sol, { onTick: () => {
        const b = state.burrowers && state.burrowers[0];
        if (!b) return;
        if (b.phase === 'telegraph' && b.stampNowActive() && first == null) first = b.ticksToStrike();
        if (b.hp < lastHp) { leads.push(first); lastHp = b.hp; first = null; }
        if (b.phase !== 'telegraph') first = null;
    } });
    assert.equal(leads.length, 3, 'three stuns');
    for (const l of leads) assert.ok(l != null && l >= 89, 'cue lead ' + l);
});

check('a spent echo is silent: never hunted after the stun', () => {
    const r = stampRun(30);
    const echo = { id: 0, runData: [], x: 200, y: 125, w: 30, h: 30, isActive: true };
    const player = { x: 300, y: 200, w: 30, h: 30 };
    for (let t = 0; t < 40; t++) { echo.x = t % 2 ? 85 : 200; r.boss.update([player, echo]); }
    assert.equal(r.boss.noise.has('echo:0'), false);
    assert.ok(!r.boss.hunt || r.boss.hunt.kind !== 'echo');
    state.bossCheckpoint = null; state.bossCheckpointLive = false;
});

check("echo steps off during the cue: HOLD/STAMP NOW drop at once and it says 'ECHO LEFT — step off!'", () => {
    resetWorld();
    const core = new PressurePlate('c1', 80, 80, []);
    state.plates = [core];
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast')];
    const boss = new Burrower(300, 300, { surfaceInterval: 1, telegraphTime: 1.5, corePlateIds: ['c1'], maxStunsPerLoop: 1 });
    state.burrowers = [boss];
    const player = { x: 85, y: 85, w: 30, h: 30 }; state.player = player;
    const echo = { id: 0, runData: [], x: 200, y: 125, w: 30, h: 30, isActive: true };
    const strikeAt = boss.intervalTicks() + boss.telegraphTicks();
    let left = null;
    for (let t = 1; t < strikeAt; t++) {
        if (t === strikeAt - 60) { echo.x = 85; }
        if (t === strikeAt - 30) { echo.x = 200; }
        boss.update([player, echo]);
        if (t === strikeAt - 29) left = { label: boss.targetLabel(), cue: boss.stampNowActive() };
    }
    assert.deepEqual(left, { label: 'ECHO LEFT — step off!', cue: false });
});

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('loudest wins checks passed');

check('holding the lit plate + echo ring stamp stuns even when the strike was locked elsewhere', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/entities/bosses/Burrower.js', import.meta.url), 'utf8');
    assert.match(src, /const ringStamp = this\.playerModeStampCrack\(actors\)/);
    assert.match(src, /this\.playerMode \|\| this\.playerHoldsLivePlate\(\)/);
});
