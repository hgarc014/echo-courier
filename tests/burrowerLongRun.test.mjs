// The burrower keeps a surface cadence for minutes of sim time. Targets shown
// during a telegraph are intact cracks. Dormant is a loop-clock countdown.
// Run: node tests/burrowerLongRun.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, getLevelSetup } = await import('../src/data/levels.js');
const { Burrower } = await import('../src/entities/bosses/Burrower.js');

const SIM_SECONDS = 200;
const SIM_TICKS = SIM_SECONDS * 60;

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failures++;
        console.log(`  FAIL ${name}\n       ${err.stack || err.message}`);
    }
}

function sinkhole() {
    const index = LEVELS.findIndex(level => String(level.name).startsWith('W2-MB'));
    const level = LEVELS[index];
    const setup = getLevelSetup(index);
    state.currentLevelMeta = level;
    state.currentTick = 0;
    state.bossCheckpoint = null;
    state.bossCheckpointLive = false;
    state.packages = setup.packages || [];
    state.plates = setup.plates;
    state.cracks = setup.cracks;
    state.doors = setup.doors;
    state.burrowers = setup.burrowers;
    return { level, setup, boss: setup.burrowers[0] };
}

function body(x, y, extra = {}) {
    return { x, y, w: 30, h: 30, isActive: true, id: 'player', ...extra };
}

function step(boss, actors, label) {
    for (const actor of actors) actor.isActive = true;
    for (const plate of state.plates) plate.update(actors, state.packages);
    const prev = boss.phase;
    boss.update(actors);
    if (boss.phase === 'telegraph') assertTelegraph(boss, `${label} at telegraph`);
    for (const crack of state.cracks) crack.update(actors);
    // Same post-pass as the game: the drawn mark follows the floor resolving.
    if (boss.phase === 'burrow' || boss.phase === 'telegraph') boss.ensureTarget(actors);
    if (boss.phase === 'telegraph') assertTelegraph(boss, `${label} after floor`);
    state.currentTick++;
    return prev;
}

function assertTelegraph(boss, where) {
    if (boss.phase !== 'telegraph') return;
    if (boss.homeFallback) {
        assert.equal(boss.lockedTile, null, where + ' den fallback has no crack');
        return;
    }
    // Player mode strikes the courier's own grid tile, on any floor.
    if (boss.playerMode) {
        assert.ok(boss.lockedTile && boss.lockedTile.w === 40 && boss.lockedTile.h === 40, where + ' player tile');
        return;
    }
    const crack = boss.findCrack(boss.lockedTile);
    assert.ok(crack, where + ' telegraph has no crack');
    assert.equal(crack.broken, false, where);
    assert.equal(crack.collapsing, false, where);
    assert.equal(crack.overlapsPlate(), false, where);
    assert.equal(boss.crackIsTargetable(crack), true, where);
}

// Hunt until each surface, ignoring the wait inside stun or dormant.
function hunt(boss, actorsAt, ticks, label) {
    const bound = boss.intervalTicks() + boss.telegraphTicks() + 5;
    let windowStart = 0;
    let paused = false;
    let surfaces = 0;
    let telegraphs = 0;
    let homeTelegraphs = 0;
    for (let t = 0; t < ticks; t++) {
        const actors = actorsAt(t);
        const prev = step(boss, actors, `${label} t=${t}`);
        if (boss.phase === 'telegraph') {
            telegraphs++;
            if (boss.homeFallback) homeTelegraphs++;
        }
        if (prev === 'telegraph' && boss.phase !== 'telegraph') {
            surfaces++;
            assert.ok(t - windowStart <= bound, `${label} surface gap ${t - windowStart} > ${bound}`);
            if (boss.phase === 'stun' || boss.phase === 'dormant') paused = true;
            else windowStart = t;
        }
        if (paused && boss.phase !== 'stun' && boss.phase !== 'dormant') {
            paused = false;
            windowStart = t;
        }
    }
    return { surfaces, telegraphs, homeTelegraphs, bound };
}

check('a collapsing or broken crack is never the telegraphed tile', () => {
    const { boss } = sinkhole();
    const spent = state.cracks[0];
    const open = state.cracks[state.cracks.length - 1];
    spent.collapsing = true;
    const onSpent = body(spent.x + 5, spent.y + 5);
    const far = body(open.x + 5, open.y + 5, { id: 2, runData: [] });
    let saw = false;
    for (let i = 0; i < boss.intervalTicks() + boss.telegraphTicks() + 5; i++) {
        step(boss, [onSpent, far], 'skip collapsing');
        if (boss.phase === 'telegraph' && !boss.homeFallback) {
            saw = true;
            assert.notEqual(boss.lockedTile.x, spent.x);
            assert.notEqual(boss.lockedTile.y, spent.y);
            assertTelegraph(boss, 'skip collapsing');
        }
    }
    assert.equal(saw, true);
    spent.collapsing = false;
    spent.broken = true;
    boss.phase = 'burrow';
    boss.cycleLocked = false;
    boss.lockedTile = null;
    boss.phaseTicks = 0;
    boss.cycleTicks = 0;
    saw = false;
    for (let i = 0; i < boss.intervalTicks() + boss.telegraphTicks() + 5; i++) {
        step(boss, [body(spent.x + 5, spent.y + 5)], 'skip broken');
        if (boss.phase === 'telegraph' && !boss.homeFallback) {
            saw = true;
            // With no noise the courier is the target: the strike goes to their own
            // tile on any floor (here a spent crack), never to some other crack.
            assert.equal(boss.playerMode, true);
            assert.deepEqual(boss.lockedTile, boss.playerTile(body(spent.x + 5, spent.y + 5)));
        }
    }
    assert.equal(saw, true);
});

check('200s on a core plate: presses, surfaces, then the stun cap is a loop clock', () => {
    const { boss } = sinkhole();
    // The lit core plate (each stun spends it and lights the next).
    const plate = state.plates.find(p => p.id === boss.liveCoreIds()[0]);
    const player = body(plate.x + (plate.w - 30) / 2, plate.y + (plate.h - 30) / 2);
    // 'Loudest wins': a stun needs an echo stamping the struck crack while the courier
    // holds the plate. This echo waits off the floor and steps onto the locked crack in
    // the last 10 ticks of each telegraph (was: courier alone on the plate stunned).
    const echo = body(300, 300, { id: 0, runData: [] });
    const actorsAt = () => {
        const tile = boss.lockedTile;
        if (boss.phase === 'telegraph' && tile && boss.telegraphTicks() - boss.phaseTicks <= 10) {
            echo.x = tile.x + (tile.w - 30) / 2; echo.y = tile.y + (tile.h - 30) / 2;
        } else { echo.x = 300; echo.y = 300; }
        return [player, echo];
    };
    let dormantAt = -1;
    let presses = 0;
    const bound = boss.intervalTicks() + boss.telegraphTicks() + 5;
    let windowStart = 0;
    for (let t = 0; t < SIM_TICKS; t++) {
        const prev = step(boss, actorsAt(), `plate t=${t}`);
        assert.equal(plate.isPressed, true, `${plate.id} not pressed at ${t}`);
        assert.equal(plate.pressVisual().pressed, true);
        presses++;
        if (boss.phase === 'telegraph') assertTelegraph(boss, `plate t=${t}`);
        if (prev === 'telegraph' && boss.phase !== 'telegraph' && boss.phase !== 'dormant' && !boss.phase) {
            /* unreachable */
        }
        if (prev !== 'stun' && prev !== 'dormant' && prev === 'telegraph' && boss.phase !== 'dormant') {
            if (boss.phase !== 'stun') {
                assert.ok(t - windowStart <= bound, `plate gap ${t - windowStart}`);
                windowStart = t;
            } else {
                assert.ok(t - windowStart <= bound, `plate approach ${t - windowStart}`);
            }
        }
        if (boss.phase === 'dormant' && dormantAt < 0) dormantAt = t;
        if (dormantAt >= 0) {
            assert.equal(boss.phase, 'dormant', `left dormant at ${t}`);
            const ui = boss.getUiState();
            assert.match(ui.statusText, /DORMANT — wakes on rewind/);
            assert.match(ui.statusText, /loop clock/);
            if (t > dormantAt && t % 60 === 0) {
                const before = ui.loopSecondsLeft;
                // currentTick already advanced inside step; the next reading drops.
                assert.ok(before >= 0);
            }
        }
    }
    assert.equal(presses, SIM_TICKS);
    assert.ok(dormantAt > 0, 'never went dormant');
    assert.equal(boss.stunsThisLoop, 1);
    assert.equal(boss.hp, boss.maxHp - 1);
    const atCap = boss.getUiState();
    assert.equal(atCap.loopSecondsLeft, 0);
    assert.match(atCap.statusText, /loop clock 0s/);

    const hp = boss.hp;
    state.bossCheckpoint = { burrower: { hp } };
    state.bossCheckpointLive = true;
    const woken = new Burrower(boss.startX, boss.startY, {
        id: 'burrower',
        hp: boss.maxHp,
        surfaceInterval: boss.surfaceInterval,
        telegraphTime: boss.telegraphTime,
        stunTime: boss.stunTime,
        maxStunsPerLoop: 1,
        corePlateIds: [...boss.corePlateIds],
        defeatDoorId: boss.defeatDoorId
    });
    state.bossCheckpointLive = false;
    state.burrowers = [woken];
    assert.equal(woken.phase, 'burrow');
    assert.equal(woken.hp, hp);
    assert.equal(woken.stunsThisLoop, 0);
    const again = hunt(woken, actorsAt, woken.intervalTicks() + woken.telegraphTicks() + 5, 'after rewind');
    assert.ok(again.surfaces >= 1, 'rewind did not resume surfacing');
});

check('200s of scripted player and echo paths keeps surfacing on valid cracks', () => {
    const { boss } = sinkhole();
    boss.maxStunsPerLoop = null;
    const result = hunt(boss, (t) => {
        const x = Math.max(25, Math.min(745, 400 + Math.cos(t / 35) * 220));
        const y = Math.max(25, Math.min(545, 300 + Math.sin(t / 35) * 180));
        const ex = Math.max(25, Math.min(745, 420 + Math.cos(t / 48 + 1.7) * 160));
        const ey = Math.max(25, Math.min(545, 260 + Math.sin(t / 48 + 1.7) * 140));
        return [
            body(x, y),
            body(ex, ey, { id: 1, runData: [] })
        ];
    }, SIM_TICKS, 'patrol');
    assert.ok(result.surfaces >= 40, `only ${result.surfaces} surfaces in ${SIM_SECONDS}s`);
    assert.ok(result.telegraphs > result.surfaces);
});

check('200s with every crack spent still surfaces: knit clear tiles, else the den', () => {
    const { boss } = sinkhole();
    boss.maxStunsPerLoop = null;
    const occupied = state.cracks[0];
    for (const crack of state.cracks) {
        crack.broken = true;
        crack.collapsing = false;
    }
    const stand = body(occupied.x + 5, occupied.y + 5);
    const knit = hunt(boss, () => [stand], SIM_TICKS, 'knit');
    assert.ok(knit.surfaces >= 40, `knit surfaces ${knit.surfaces}`);
    assert.ok(knit.telegraphs > knit.homeTelegraphs, 'spent floor never produced a crack telegraph');
    assert.equal(occupied.broken, true, 'occupied crack was restored under the body');
    boss.phase = 'burrow';
    boss.cycleLocked = false;
    boss.lockedTile = null;
    boss.ensureTarget([stand]);
    assert.equal(boss.homeFallback, false, 'clear cracks should knit instead of the den');
    assert.ok(state.cracks.some(c => c !== occupied && boss.crackIsTargetable(c)), 'no clear crack was knitted');

    const full = sinkhole();
    full.boss.maxStunsPerLoop = null;
    for (const crack of state.cracks) {
        crack.broken = true;
        crack.collapsing = false;
    }
    const crowd = state.cracks.map((crack, i) => body(crack.x + 5, crack.y + 5, { id: i, runData: i ? [] : undefined }));
    const den = hunt(full.boss, () => crowd, SIM_TICKS, 'den');
    assert.ok(den.surfaces >= 40, `den surfaces ${den.surfaces}`);
    assert.ok(den.homeTelegraphs > 0, 'expected den telegraphs when every crack is occupied');
});

process.exit(failures ? 1 : 0);
