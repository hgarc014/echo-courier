// World 2: editor round-trip of the Subfloor levels, and Burrower unit behavior.
// Run: node tests/world2.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, getLevelSetup, serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');
const { applyBurrowerConfig } = await import('../src/ui/editorInspector.js');
const { Burrower, burrowerTicks } = await import('../src/entities/bosses/Burrower.js');
const { CrackedFloor, Pit } = await import('../src/entities/hazards.js');
const { PressurePlate, Door, Package } = await import('../src/entities/interactables.js');
const { SFX } = await import('../src/core/audio.js');
const {
    PIT_KILL_FRACTION,
    PLATE_PRESS_FRACTION,
    WARNING_RING_TICKS,
    CRUMBLE_MIN_TICKS,
    killZone,
    centerInKillZone,
    actorPressesPlate
} = await import('../src/core/hitZones.js');

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

function resetWorld() {
    state.bossCheckpoint = null;
    state.bossCheckpointLive = false;
    state.currentTick = 0;
    state.packages = [];
    state.doors = [];
    state.plates = [];
    state.cracks = [];
}

const w2 = LEVELS.map((level, index) => ({ level, index })).filter(({ level }) => String(level.name).startsWith('W2-'));
assert.equal(w2.length, 5, 'expected five W2 levels');

for (const { level, index } of w2) {
    check(`editor round-trip ${level.name}`, () => {
        const setup = getLevelSetup(index);
        setEditorLevelMetaFromLevel(level);
        const first = serializeLevel({ ...setup, meta: state.editorLevelMeta });
        const json = JSON.parse(JSON.stringify(first));
        state.editorLevelMeta = null;
        const loaded = deserializeLevel(json);
        const second = serializeLevel({ ...loaded, meta: state.editorLevelMeta });
        assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), json);

        assert.equal(json.meta.world, 2);
        assert.deepStrictEqual(json.meta.unlocks, level.unlocks);
        assert.equal(json.meta.loopTime, level.loopTime);
        assert.equal(json.crackSpeed, 'fast');
        assert.equal(json.meta.crackSpeed, 'fast');
        assert.equal(state.editorLevelMeta.crackSpeed, 'fast');
        for (const crack of loaded.cracks) assert.equal(crack.crackSpeed, 'fast');
        assert.equal(json.meta.maxGhosts, level.maxGhosts);
        assert.deepStrictEqual(json.meta.grants, level.grants || []);

        if (level.name.startsWith('W2-MB')) {
            assert.equal(json.burrowers.length, 1);
            const boss = json.burrowers[0];
            assert.equal(boss.hp, 3);
            assert.equal(boss.surfaceInterval, 3);
            assert.equal(boss.telegraphTime, 1);
            assert.equal(boss.stunTime, 2);
            assert.deepStrictEqual(boss.corePlateIds, ['c1', 'c2', 'c3']);
            assert.equal(boss.defeatDoorId, 'boss_door');
            assert.equal(boss.maxStunsPerLoop, 1);
            assert.equal(loaded.burrowers[0].maxHp, 3);
            assert.equal(loaded.burrowers[0].hp, 3);
            assert.equal(loaded.burrowers[0].maxStunsPerLoop, 1);
            assert.equal(json.meta.isBoss, true);
            assert.equal(json.meta.hintLine, level.hintLine);
            assert.match(json.meta.hintLine, /crack touching a pressed core plate/);
            assert.match(json.meta.hintLine, /once per loop/);
            assert.match(json.meta.hintLine, /becomes an echo/);
            assert.equal(json.meta.pitKillFraction, undefined);
        } else {
            assert.equal(json.meta.hintLine, undefined);
            assert.deepStrictEqual(json.burrowers, []);
        }
    });
}

check('inspector params survive serialize → deserialize', () => {
    const mb = w2.find(({ level }) => level.name.startsWith('W2-MB'));
    const setup = getLevelSetup(mb.index);
    applyBurrowerConfig(setup.burrowers[0], {
        hp: 5,
        surfaceInterval: 4.5,
        telegraphTime: 1.5,
        stunTime: 0.5,
        maxStunsPerLoop: 2,
        corePlateIds: 'core-a, core-b',
        defeatDoorId: 'gate'
    });
    setEditorLevelMetaFromLevel(mb.level);
    const json = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    const back = deserializeLevel(json);
    const boss = back.burrowers[0];
    assert.equal(boss.hp, 5);
    assert.equal(boss.maxHp, 5);
    assert.equal(boss.surfaceInterval, 4.5);
    assert.equal(boss.telegraphTime, 1.5);
    assert.equal(boss.stunTime, 0.5);
    assert.equal(boss.maxStunsPerLoop, 2);
    assert.deepStrictEqual(boss.corePlateIds, ['core-a', 'core-b']);
    assert.equal(boss.defeatDoorId, 'gate');
    const again = JSON.parse(JSON.stringify(serializeLevel({ ...back, meta: state.editorLevelMeta })));
    assert.deepStrictEqual(again.burrowers, json.burrowers);
    assert.equal(again.burrowers[0].maxStunsPerLoop, 2);
});

check('blank or non-positive maxStunsPerLoop is unlimited and omitted from JSON', () => {
    const mb = w2.find(({ level }) => level.name.startsWith('W2-MB'));
    const setup = getLevelSetup(mb.index);
    const ent = setup.burrowers[0];
    applyBurrowerConfig(ent, { maxStunsPerLoop: 4 });
    assert.equal(ent.maxStunsPerLoop, 4);
    for (const raw of ['', null, 0, -2, 'nope']) {
        applyBurrowerConfig(ent, { maxStunsPerLoop: raw });
        assert.equal(ent.maxStunsPerLoop, null);
    }
    setEditorLevelMetaFromLevel(mb.level);
    const json = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    assert.equal(json.burrowers[0].maxStunsPerLoop, undefined);
    const back = deserializeLevel(json);
    assert.equal(back.burrowers[0].maxStunsPerLoop, null);
    applyBurrowerConfig(back.burrowers[0], { maxStunsPerLoop: '3' });
    const again = JSON.parse(JSON.stringify(serializeLevel({ ...back, meta: state.editorLevelMeta })));
    assert.equal(again.burrowers[0].maxStunsPerLoop, 3);
    const restored = deserializeLevel(again).burrowers[0];
    assert.equal(restored.maxStunsPerLoop, 3);
});

function fastBoss(x, y, opts = {}) {
    return new Burrower(x, y, {
        hp: 3,
        surfaceInterval: 0.05,
        telegraphTime: 0.05,
        stunTime: 2,
        corePlateIds: [],
        ...opts
    });
}

function runUntil(boss, actors, pred, max = 40) {
    for (let i = 0; i < max; i++) {
        boss.update(actors);
        if (pred()) return i + 1;
    }
    throw new Error(`burrower did not reach expected state (phase ${boss.phase})`);
}

check('burrower targets the nearest actor, including an echo', () => {
    resetWorld();
    state.cracks = [
        new CrackedFloor(0, 0, 40, 40, 'fast'),
        new CrackedFloor(500, 500, 40, 40, 'fast')
    ];
    const player = { x: 500, y: 500, w: 30, h: 30 };
    const echo = { x: 0, y: 0, w: 30, h: 30, isActive: true, id: 0 };
    const boss = fastBoss(80, 80, { telegraphTime: 1 });
    runUntil(boss, [player, echo], () => boss.phase === 'telegraph');
    assert.equal(boss.lockedTile.x, 0);
    assert.equal(boss.lockedTile.y, 0);
    assert.equal(state.cracks[0].collapsing, false);
});

check('inactive echoes are not targets', () => {
    resetWorld();
    state.cracks = [
        new CrackedFloor(0, 0, 40, 40, 'fast'),
        new CrackedFloor(500, 500, 40, 40, 'fast')
    ];
    const player = { x: 500, y: 500, w: 30, h: 30 };
    const echo = { x: 0, y: 0, w: 30, h: 30, isActive: false, id: 0 };
    const boss = fastBoss(80, 80, { telegraphTime: 1 });
    runUntil(boss, [player, echo], () => boss.phase === 'telegraph');
    assert.equal(boss.lockedTile.x, 500);
    assert.equal(boss.lockedTile.y, 500);
});

check('dust telegraph finishes before the crack collapses', () => {
    resetWorld();
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast')];
    const player = { x: 5, y: 5, w: 30, h: 30 };
    const boss = fastBoss(200, 200);
    let sawTelegraph = false;
    for (let i = 0; i < 30; i++) {
        boss.update([player]);
        if (boss.phase === 'telegraph') {
            assert.equal(state.cracks[0].collapsing, false);
            assert.equal(state.cracks[0].broken, false);
            sawTelegraph = true;
        }
        if (state.cracks[0].collapsing) break;
    }
    assert.equal(sawTelegraph, true);
    assert.equal(state.cracks[0].collapsing, true);
    assert.equal(state.cracks[0].broken, false);
});

check('surfacing beside a pressed core plate stuns for 1 HP', () => {
    resetWorld();
    const plate = new PressurePlate('c1', 80, 80, []);
    plate.isPressed = true;
    state.plates = [plate];
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast')];
    state.doors = [new Door('boss_door', 0, 0, 40, 80)];
    const actor = { x: 85, y: 85, w: 30, h: 30 };
    const boss = fastBoss(10, 10, { corePlateIds: ['c1'], stunTime: 2 });
    runUntil(boss, [actor], () => boss.phase === 'stun' || boss.hp < 3);
    assert.equal(boss.hp, 2);
    assert.equal(boss.phase, 'stun');
    assert.equal(state.cracks[0].collapsing, true);
    assert.equal(state.bossCheckpoint.burrower.hp, 2);
});

check('after stunTime the burrower goes home and surfaces again', () => {
    resetWorld();
    const plate = new PressurePlate('c1', 80, 80, []);
    plate.isPressed = true;
    state.plates = [plate];
    // Two cracks. The actor stands on the south one, which collapses on the first
    // stun, so the next cycle has to pick the east crack instead of the spent tile.
    state.cracks = [
        new CrackedFloor(80, 120, 40, 40, 'fast'),
        new CrackedFloor(120, 80, 40, 40, 'fast')
    ];
    state.doors = [new Door('boss_door', 0, 0, 40, 80)];
    const actor = { x: 85, y: 125, w: 30, h: 30 };
    const boss = fastBoss(10, 10, {
        corePlateIds: ['c1'],
        stunTime: 0.05,
        surfaceInterval: 0.05,
        telegraphTime: 0.05
    });
    assert.equal(boss.maxStunsPerLoop, null);
    runUntil(boss, [actor], () => boss.phase === 'stun');
    assert.equal(boss.hp, 2);
    const stunLen = boss.stunTicks();
    for (let i = 0; i < stunLen - 1; i++) boss.update([actor]);
    assert.equal(boss.phase, 'stun');
    boss.update([actor]);
    assert.equal(boss.phase, 'burrow');
    assert.equal(boss.x, boss.startX);
    assert.equal(boss.y, boss.startY);
    assert.equal(boss.stunsThisLoop, 1);
    runUntil(boss, [actor], () => boss.phase === 'stun' || boss.hp < 2, 80);
    assert.equal(boss.hp, 1);
    assert.equal(boss.phase, 'stun');
    assert.notEqual(boss.phase, 'dormant');
});

check('maxStunsPerLoop 1 stays dormant after the stun until a new instance', () => {
    resetWorld();
    const plate = new PressurePlate('c1', 80, 80, []);
    plate.isPressed = true;
    state.plates = [plate];
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast')];
    state.doors = [new Door('boss_door', 0, 0, 40, 80)];
    const actor = { x: 85, y: 125, w: 30, h: 30 };
    const boss = fastBoss(10, 10, {
        corePlateIds: ['c1'],
        stunTime: 0.05,
        surfaceInterval: 0.05,
        telegraphTime: 0.05,
        maxStunsPerLoop: 1
    });
    runUntil(boss, [actor], () => boss.phase === 'stun');
    assert.equal(boss.hp, 2);
    for (let i = 0; i < boss.stunTicks(); i++) boss.update([actor]);
    assert.equal(boss.phase, 'dormant');
    assert.equal(boss.hp, 2);
    for (let i = 0; i < 40; i++) boss.update([actor]);
    assert.equal(boss.phase, 'dormant');
    assert.equal(boss.hp, 2);

    state.bossCheckpoint = { burrower: { hp: boss.hp } };
    state.bossCheckpointLive = true;
    const next = fastBoss(10, 10, {
        id: 'burrower',
        corePlateIds: ['c1'],
        stunTime: 0.05,
        maxStunsPerLoop: 1
    });
    assert.equal(next.hp, 2);
    assert.equal(next.phase, 'burrow');
    assert.equal(next.stunsThisLoop, 0);
});

check('a pressed non-core plate collapses the tile without a stun', () => {
    resetWorld();
    const plate = new PressurePlate('other', 80, 80, []);
    plate.isPressed = true;
    state.plates = [plate];
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast')];
    state.doors = [];
    const actor = { x: 85, y: 85, w: 30, h: 30 };
    const boss = fastBoss(10, 10, { corePlateIds: ['c1'], stunTime: 2 });
    runUntil(boss, [actor], () => state.cracks[0].collapsing);
    assert.equal(boss.hp, 3);
    assert.notEqual(boss.phase, 'stun');
});

function playerAt(x, y) {
    return { x, y, w: 30, h: 30, assetName: 'player' };
}

check('hole edge overlap survives and a center over the hole falls', () => {
    resetWorld();
    assert.equal(PIT_KILL_FRACTION, 0.65);
    const pit = new Pit(0, 0, 40, 40);
    const zone = killZone(pit);
    assert.equal(zone.w, 40 * PIT_KILL_FRACTION);
    assert.equal(zone.x, (40 - zone.w) / 2);
    // Body overlaps the tile; center sits in the rim, outside the kill rect.
    const edge = playerAt(-10, 5);
    const edgeCenter = edge.x + 15;
    assert.ok(edgeCenter < zone.x);
    assert.equal(centerInKillZone(edge, pit), false);
    assert.equal(pit.update([edge]), null);
    // Centered on the hole.
    const mid = playerAt(zone.x + zone.w / 2 - 15, zone.y + zone.h / 2 - 15);
    assert.equal(centerInKillZone(mid, pit), true);
    assert.equal(pit.update([mid]), 'Fell into pit!');
    // Same rule on a broken crack, and the drawn zone is that same rect.
    const crack = new CrackedFloor(100, 100, 40, 40, 'fast');
    crack.broken = true;
    state.cracks = [crack];
    const crackZone = crack.killZoneRect();
    assert.deepStrictEqual(crackZone, killZone(crack, PIT_KILL_FRACTION));
    const rim = playerAt(100 - 10, 105);
    assert.equal(centerInKillZone(rim, crack), false);
    assert.equal(crack.update([rim]), null);
    const dropped = playerAt(crackZone.x + crackZone.w / 2 - 15, crackZone.y + crackZone.h / 2 - 15);
    assert.equal(crack.update([dropped]), 'Fell into pit!');
});

check('edge overlap presses a plate and a sliver does not', () => {
    resetWorld();
    assert.equal(PLATE_PRESS_FRACTION, 0.25);
    const plate = new PressurePlate('p', 0, 0, []);
    state.plates = [plate];
    // 10×30 = 300 / 900 ≈ 0.33 of the actor.
    const edge = { x: 30, y: 0, w: 30, h: 30, isActive: true };
    assert.ok(actorPressesPlate(edge, plate));
    plate.update([edge], []);
    assert.equal(plate.isPressed, true);
    // 2×30 = 60 / 900 ≈ 0.067. Bounding-box contact is not enough.
    const sliver = { x: 38, y: 0, w: 30, h: 30, isActive: true };
    assert.equal(actorPressesPlate(sliver, plate), false);
    plate.update([sliver], []);
    assert.equal(plate.isPressed, false);
    const pkg = new Package('pkg', 30, 0, 'standard');
    assert.equal(actorPressesPlate(pkg, plate), true);
    plate.update([], [pkg]);
    assert.equal(plate.isPressed, true);
});

check('plate tiles never collapse, and the c3 corner at (565,330) is not a pit', () => {
    resetWorld();
    const plate = new PressurePlate('c3', 480, 280, []);
    plate.isPressed = true;
    state.plates = [plate];
    const onPlate = new CrackedFloor(480, 280, 40, 40, 'fast');
    const right = new CrackedFloor(520, 280, 40, 40, 'fast');
    state.cracks = [onPlate, right];

    onPlate.showWarningRing();
    onPlate.commitWarning();
    onPlate.startCollapse();
    onPlate.broken = true;
    onPlate.collapsing = true;
    const standing = playerAt(495, 295);
    const standCenter = { x: standing.x + 15, y: standing.y + 15 };
    assert.ok(standCenter.x >= plate.x && standCenter.x <= plate.x + plate.w);
    assert.ok(standCenter.y >= plate.y && standCenter.y <= plate.y + plate.h);
    assert.equal(onPlate.update([standing]), null);
    assert.equal(onPlate.broken, false);
    assert.equal(onPlate.collapsing, false);
    assert.equal(onPlate.showingWarning, false);

    // QA died around (565, 330): body clips the crack east of c3, center is outside the kill zone.
    const qa = playerAt(550, 315);
    assert.equal(qa.x + 15, 565);
    assert.equal(qa.y + 15, 330);
    right.broken = true;
    assert.equal(centerInKillZone(qa, right), false);
    assert.equal(right.update([qa]), null);
    assert.equal(right.broken, true);
});

check('no tile collapses without a warning ring, and the crumble frame lasts >= 0.5s', () => {
    resetWorld();
    const fresh = new CrackedFloor(0, 0, 40, 40, 'fast');
    state.cracks = [fresh];
    fresh.startCollapse();
    assert.equal(fresh.collapsing, false);
    assert.equal(fresh.ringShown, true);
    assert.equal(fresh.showingWarning, true);

    const weighted = new CrackedFloor(0, 80, 40, 40, 'fast');
    state.cracks.push(weighted);
    const actor = { x: 5, y: 85, w: 30, h: 30, isActive: true };
    for (let i = 0; i < WARNING_RING_TICKS - 1; i++) {
        assert.equal(weighted.update([actor]), null);
        assert.equal(weighted.collapsing, false);
        assert.equal(weighted.showingWarning, true);
        assert.equal(weighted.ringShown, true);
    }
    weighted.update([actor]);
    assert.equal(weighted.collapsing, true);
    assert.equal(weighted.ringShown, true);
    assert.equal(weighted.stage, 1);
    assert.equal(weighted.broken, false);
    assert.equal(weighted.ticks, 1);
    for (let i = 0; i < CRUMBLE_MIN_TICKS - 1; i++) weighted.update([]);
    assert.equal(weighted.ticks, CRUMBLE_MIN_TICKS);
    assert.equal(weighted.stage, 1);
    assert.equal(weighted.broken, false);

    const source = new CrackedFloor(200, 0, 40, 40, 'fast');
    const side = new CrackedFloor(240, 0, 40, 40, 'fast');
    state.cracks.push(source, side);
    source.showWarningRing();
    source.startCollapse();
    assert.equal(source.collapsing, true);
    let guard = 0;
    while (!source.broken && guard < 200) { source.update([]); guard++; }
    assert.equal(source.broken, true);
    assert.equal(side.collapsing, false);
    assert.equal(side.broken, false);
    assert.equal(side.showingWarning, true);
    assert.equal(side.ringShown, true);
});

check('burrower strike shows the warning ring before the tile collapses', () => {
    resetWorld();
    state.cracks = [new CrackedFloor(0, 0, 40, 40, 'fast')];
    const player = { x: 5, y: 5, w: 30, h: 30 };
    const boss = fastBoss(200, 200);
    let sawRing = false;
    for (let i = 0; i < 30; i++) {
        boss.update([player]);
        if (boss.phase === 'telegraph') {
            assert.equal(state.cracks[0].collapsing, false);
            assert.equal(state.cracks[0].ringShown, true);
            assert.equal(state.cracks[0].showingWarning, true);
            sawRing = true;
        }
        if (state.cracks[0].collapsing) break;
    }
    assert.equal(sawRing, true);
    assert.equal(state.cracks[0].collapsing, true);
    assert.equal(state.cracks[0].ringShown, true);
    assert.equal(state.cracks[0].broken, false);
});

check('getUiState reports dormant, stun countdown, and player vs echo', () => {
    resetWorld();
    state.cracks = [
        new CrackedFloor(0, 0, 40, 40, 'fast'),
        new CrackedFloor(400, 0, 40, 40, 'fast')
    ];
    const echo = { x: 0, y: 0, w: 30, h: 30, isActive: true, id: 0, runData: [] };
    const farPlayer = { x: 400, y: 0, w: 30, h: 30 };
    const hunter = fastBoss(180, 0, { telegraphTime: 1, surfaceInterval: 1 });
    hunter.update([farPlayer, echo]);
    let ui = hunter.getUiState();
    assert.equal(ui.phase, 'burrow');
    assert.equal(ui.dormant, false);
    assert.equal(ui.targetKind, 'echo');
    assert.equal(ui.targetId, 0);
    assert.ok(ui.surfaceInTicks > 0);

    const nearPlayer = { x: 0, y: 0, w: 30, h: 30 };
    const farEcho = { x: 400, y: 0, w: 30, h: 30, isActive: true, id: 1 };
    const hunter2 = fastBoss(20, 0, { telegraphTime: 1, surfaceInterval: 1 });
    // After the first lock of a loop (which an echo always wins), the nearest body is the lure.
    hunter2.firstLockPending = false;
    hunter2.update([nearPlayer, farEcho]);
    ui = hunter2.getUiState();
    assert.equal(ui.targetKind, 'player');
    assert.equal(ui.targetId, 'player');
    assert.equal(ui.dormant, false);

    const plate = new PressurePlate('c1', 0, 0, []);
    plate.isPressed = true;
    state.plates = [plate];
    state.doors = [new Door('boss_door', 0, 0, 40, 80)];
    state.cracks = [new CrackedFloor(0, 40, 40, 40, 'fast')];
    const actor = { x: 5, y: 45, w: 30, h: 30 };
    const boss = fastBoss(10, 10, {
        corePlateIds: ['c1'],
        stunTime: 2,
        surfaceInterval: 0.05,
        telegraphTime: 0.05,
        maxStunsPerLoop: 1
    });
    runUntil(boss, [actor], () => boss.phase === 'stun');
    ui = boss.getUiState();
    assert.equal(ui.phase, 'stun');
    assert.equal(ui.dormant, false);
    assert.equal(ui.stunTicksLeft, burrowerTicks(2));
    assert.ok(Math.abs(ui.stunSeconds - 2) < 1e-6);
    boss.update([actor]);
    ui = boss.getUiState();
    assert.equal(ui.stunTicksLeft, burrowerTicks(2) - 1);
    assert.ok(ui.stunSeconds > 0);

    let dormantCues = 0;
    const orig = SFX.burrowerDormant;
    SFX.burrowerDormant = () => { dormantCues++; };
    try {
        for (let i = 0; i < boss.stunTicks(); i++) boss.update([actor]);
        ui = boss.getUiState();
        assert.equal(ui.phase, 'dormant');
        assert.equal(ui.dormant, true);
        assert.equal(ui.stunTicksLeft, 0);
        assert.equal(ui.stunSeconds, 0);
        assert.equal(ui.surfaceInTicks, 0);
        assert.equal(ui.targetKind, null);
        assert.match(ui.statusText, /DORMANT — wakes on rewind/);
        assert.match(ui.statusText, /rewind to wake/);
        state.currentLevelMeta = { loopTime: 30 };
        state.currentTick = 60;
        ui = boss.getUiState();
        assert.equal(ui.loopSecondsLeft, 29);
        assert.match(ui.statusText, /loop clock 29s/);
        state.currentTick = 120;
        assert.equal(boss.getUiState().loopSecondsLeft, 28);
        state.currentLevelMeta = null;
        assert.equal(dormantCues, 1);
        for (let i = 0; i < 10; i++) boss.update([actor]);
        assert.equal(boss.getUiState().dormant, true);
        assert.equal(dormantCues, 1);
    } finally {
        SFX.burrowerDormant = orig;
        state.currentLevelMeta = null;
    }
});

check('a locked target counts down to a surface on that tile', () => {
    resetWorld();
    state.cracks = [
        new CrackedFloor(0, 0, 40, 40, 'fast'),
        new CrackedFloor(400, 0, 40, 40, 'fast')
    ];
    const player = { x: 0, y: 0, w: 30, h: 30 };
    const echo = { x: 400, y: 0, w: 30, h: 30, isActive: true, id: 1, runData: [] };
    const boss = fastBoss(10, 0, { surfaceInterval: 0.5, telegraphTime: 0.25 });
    boss.update([]);
    assert.equal(boss.phase, 'burrow');
    // No actor is not a freeze: the cycle still starts, aimed at a real crack.
    assert.equal(boss.cycleTicks, 1);
    assert.equal(boss.cycleLocked, true);
    assert.equal(boss.homeFallback, false);
    assert.equal(boss.lockedTile.x, 0);
    assert.equal(boss.lockedTile.y, 0);
    assert.equal(boss.getUiState().targetKind, null);

    boss.update([player, echo]);
    assert.equal(boss.previewTile.x, 0);
    assert.equal(boss.previewTile.y, 0);
    assert.equal(boss.getUiState().targetKind, 'player');
    let prev = boss.surfaceInTicks();
    assert.ok(prev > 0);

    // A nearer echo would steal a live re-aim. The locked tile must stay put.
    echo.x = 10;
    echo.y = 0;
    player.x = 400;
    let surfaced = false;
    let sawTelegraph = false;
    for (let i = 0; i < 120; i++) {
        boss.update([player, echo]);
        if (state.cracks[0].collapsing) {
            surfaced = true;
            assert.equal(state.cracks[1].collapsing, false);
            assert.equal(state.cracks[1].ringShown, false);
            break;
        }
        if (boss.phase === 'burrow' || boss.phase === 'telegraph') {
            const tile = boss.aimedTile();
            assert.equal(tile && tile.x, 0);
            assert.equal(tile && tile.y, 0);
            const left = boss.surfaceInTicks();
            assert.ok(left <= prev, `countdown rose ${prev} -> ${left}`);
            prev = left;
            if (boss.phase === 'telegraph') sawTelegraph = true;
        }
    }
    assert.equal(sawTelegraph, true);
    assert.equal(surfaced, true);
    assert.ok(prev <= 1);
});

check('hint line and a non-default pit fraction survive the editor round trip', () => {
    const mb = w2.find(({ level }) => level.name.startsWith('W2-MB'));
    const setup = getLevelSetup(mb.index);
    setEditorLevelMetaFromLevel(mb.level);
    assert.equal(state.editorLevelMeta.hintLine, mb.level.hintLine);
    assert.equal(state.editorLevelMeta.pitKillFraction, undefined);
    state.editorLevelMeta.pitKillFraction = 0.7;
    const json = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    assert.equal(json.meta.pitKillFraction, 0.7);
    assert.equal(json.meta.hintLine, mb.level.hintLine);
    state.editorLevelMeta = null;
    deserializeLevel(json);
    assert.equal(state.editorLevelMeta.pitKillFraction, 0.7);
    assert.equal(state.editorLevelMeta.hintLine, mb.level.hintLine);
    state.editorLevelMeta.pitKillFraction = 0.65;
    const again = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    assert.equal(again.meta.pitKillFraction, undefined);
    assert.equal(again.meta.hintLine, mb.level.hintLine);
});

check('each Sinkhole core plate registers a standing player, glows, and clicks once', () => {
    resetWorld();
    const mb = w2.find(({ level }) => level.name.startsWith('W2-MB'));
    const setup = getLevelSetup(mb.index);
    state.plates = setup.plates;
    state.cracks = setup.cracks;
    state.burrowers = setup.burrowers;
    state.doors = setup.doors;
    const courier = setup.player;
    assert.equal(courier.w, 30);
    assert.equal(courier.h, 30);
    const cores = state.plates.filter(p => setup.burrowers[0].corePlateIds.includes(p.id));
    assert.deepStrictEqual(cores.map(p => p.id), ['c1', 'c2', 'c3']);
    let clicks = 0;
    const orig = SFX.platePress;
    SFX.platePress = () => { clicks++; };
    try {
        for (const plate of cores) {
            clicks = 0;
            const player = {
                x: plate.x + (plate.w - courier.w) / 2,
                y: plate.y + (plate.h - courier.h) / 2,
                w: courier.w,
                h: courier.h,
                id: 'player',
                isActive: true
            };
            const area = player.w * player.h;
            const overlapW = Math.min(player.x + player.w, plate.x + plate.w) - Math.max(player.x, plate.x);
            const overlapH = Math.min(player.y + player.h, plate.y + plate.h) - Math.max(player.y, plate.y);
            const fraction = (overlapW * overlapH) / area;
            assert.ok(fraction >= PLATE_PRESS_FRACTION, `${plate.id} overlap ${fraction}`);
            assert.equal(actorPressesPlate(player, plate), true, plate.id);
            plate.update([player], []);
            plate.update([player], []);
            assert.equal(plate.isPressed, true, plate.id);
            assert.equal(clicks, 1, `${plate.id} click per press, not per tick`);
            const vis = plate.pressVisual();
            assert.equal(vis.pressed, true, plate.id);
            assert.equal(vis.core, true, plate.id);
            assert.equal(vis.label, 'HELD', plate.id);
            assert.equal(vis.glow, '#ffe14a', plate.id);
            for (let t = 0; t < 60; t++) {
                for (const crack of state.cracks) crack.update([player]);
                plate.update([player], []);
            }
            assert.equal(plate.isPressed, true, `${plate.id} stayed pressed`);
            assert.equal(clicks, 1, plate.id);
            const boss = state.burrowers[0];
            boss.phase = 'dormant';
            plate.isPressed = false;
            plate.update([player], []);
            assert.equal(plate.isPressed, true, `${plate.id} still presses while the burrower is dormant`);
            assert.equal(plate.pressVisual().label, 'HELD');
            plate.update([], []);
            assert.equal(plate.isPressed, false, plate.id);
            assert.equal(plate.pressVisual().pressed, false, plate.id);
            assert.equal(plate.pressVisual().label, 'CORE', plate.id);
        }
    } finally {
        SFX.platePress = orig;
    }
});

process.exit(failures ? 1 : 0);
