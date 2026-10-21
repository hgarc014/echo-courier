// World 2: editor round-trip of the Subfloor levels, and Burrower unit behavior.
// Run: node tests/world2.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, getLevelSetup, serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');
const { applyBurrowerConfig } = await import('../src/ui/editorInspector.js');
const { Burrower } = await import('../src/entities/bosses/Burrower.js');
const { CrackedFloor } = await import('../src/entities/hazards.js');
const { PressurePlate, Door } = await import('../src/entities/interactables.js');

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
        } else {
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
    state.cracks = [new CrackedFloor(80, 120, 40, 40, 'fast')];
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

process.exit(failures ? 1 : 0);
