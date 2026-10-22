// World 3: editor round-trip of the Panopticon levels, and Warden / guard-lure behavior.
// Run: node tests/world3.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, getLevelSetup, serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');
const { applyWardenConfig } = await import('../src/ui/editorInspector.js');
const { Warden } = await import('../src/entities/bosses/Warden.js');
const { Guard, CrackedFloor } = await import('../src/entities/hazards.js');
const { PressurePlate, Door } = await import('../src/entities/interactables.js');
const { pushNoiseEvent, resetNoiseEvents } = await import('../src/systems/noiseEvents.js');

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
    state.walls = [];
    state.activeGhosts = [];
    resetNoiseEvents();
}

const far = { x: 4000, y: 4000, w: 30, h: 30, cloakTimer: 0 };

const w3 = LEVELS.map((level, index) => ({ level, index })).filter(({ level }) => String(level.name).startsWith('W3-'));
assert.equal(w3.length, 5, 'expected five W3 levels');

for (const { level, index } of w3) {
    check(`editor round-trip ${level.name}`, () => {
        const setup = getLevelSetup(index);
        setEditorLevelMetaFromLevel(level);
        const first = serializeLevel({ ...setup, meta: state.editorLevelMeta });
        const json = JSON.parse(JSON.stringify(first));
        state.editorLevelMeta = null;
        const loaded = deserializeLevel(json);
        const second = serializeLevel({ ...loaded, meta: state.editorLevelMeta });
        assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), json);

        assert.equal(json.meta.world, 3);
        assert.deepStrictEqual(json.meta.unlocks, level.unlocks);
        assert.equal(json.meta.loopTime, level.loopTime);
        assert.equal(json.meta.maxGhosts, level.maxGhosts);
        assert.deepStrictEqual(json.meta.grants, level.grants || []);
        assert.deepStrictEqual(json.hints, []);
        const speed = level.crackSpeed === 'fast' ? 'fast' : 'normal';
        assert.equal(json.crackSpeed, speed);
        assert.equal(loaded.editorLevelMeta ? state.editorLevelMeta.crackSpeed : state.editorLevelMeta.crackSpeed, speed);

        if (level.name.startsWith('W3-MB')) {
            assert.equal(json.wardens.length, 1);
            const boss = json.wardens[0];
            assert.equal(boss.coneLength, 340);
            assert.equal(boss.coneAngle, 80);
            assert.equal(boss.turnSpeed, 160);
            assert.equal(boss.hearRange, 1000);
            assert.equal(boss.homeAngle, -90);
            assert.deepStrictEqual(boss.relayIds, ['r1', 'r2', 'r3']);
            assert.equal(boss.defeatDoorId, 'boss_door');
            assert.equal(json.meta.isBoss, true);
            assert.equal(json.meta.bossIntro.speaker, 'WARDEN');
            const live = loaded.wardens[0];
            assert.equal(live.coneLength, 340);
            assert.equal(live.coneAngle, 80);
            assert.equal(live.homeAngle, -90);
            assert.ok(live.isWarden);
        } else {
            assert.deepStrictEqual(json.wardens, []);
        }
    });
}

check('inspector params survive serialize → deserialize', () => {
    const mb = w3.find(({ level }) => level.name.startsWith('W3-MB'));
    const setup = getLevelSetup(mb.index);
    applyWardenConfig(setup.wardens[0], {
        coneLength: 420,
        coneAngle: 100,
        turnSpeed: 90,
        hearRange: 800,
        relaysPerLoop: 2,
        homeAngle: 45,
        relayIds: 'east, center, west',
        defeatDoorId: 'gate'
    });
    setup.wardens[0].x = 120;
    setup.wardens[0].y = 80;
    setup.wardens[0].setPost(120, 80);
    setEditorLevelMetaFromLevel(mb.level);
    const json = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    const back = deserializeLevel(json);
    const boss = back.wardens[0];
    assert.equal(boss.coneLength, 420);
    assert.equal(boss.coneAngle, 100);
    assert.equal(boss.turnSpeed, 90);
    assert.equal(boss.hearRange, 800);
    assert.equal(boss.relaysPerLoop, 2);
    assert.equal(boss.homeAngle, 45);
    assert.deepStrictEqual(boss.relayIds, ['east', 'center', 'west']);
    assert.equal(boss.defeatDoorId, 'gate');
    assert.equal(boss.x, 120);
    assert.equal(boss.y, 80);
    assert.equal(Math.round(boss.facingAngle * 180 / Math.PI), 45);
    const again = JSON.parse(JSON.stringify(serializeLevel({ ...back, meta: state.editorLevelMeta })));
    assert.deepStrictEqual(again.wardens, json.wardens);
});

function freshWarden(opts = {}) {
    resetWorld();
    return new Warden(385, 305, {
        id: 'warden',
        coneLength: 340,
        coneAngle: 80,
        turnSpeed: 160,
        hearRange: 1000,
        homeAngle: -90,
        relayIds: ['r1', 'r2', 'r3'],
        defeatDoorId: 'boss_door',
        ...opts
    });
}

check('warden turns toward the latest noise, not an older one', () => {
    const w = freshWarden();
    const home = w.facingAngle;
    state.currentTick = 1;
    pushNoiseEvent(800, 320, 'toss');
    for (let i = 0; i < 40; i++) w.update();
    const east = w.facingAngle;
    assert.ok(Math.abs(east) < 0.05, `expected to face east, got ${east}`);
    assert.notEqual(east, home);
    state.currentTick = 50;
    pushNoiseEvent(400, 0, 'alarm');
    w.update();
    const moved = w.facingAngle;
    assert.ok(moved < east - 0.01, 'head should leave the older east noise toward the new one');
    for (let i = 0; i < 40; i++) w.update();
    assert.ok(Math.abs(w.facingAngle - (-Math.PI / 2)) < 0.08, `expected north, got ${w.facingAngle}`);
});

check('relay latches only while its center is outside the cone', () => {
    const w = freshWarden({ relayIds: ['r1'] });
    const plate = new PressurePlate('r1', 380, 100, []);
    plate.isPressed = true;
    state.plates = [plate];
    const centerX = plate.x + plate.w / 2;
    const centerY = plate.y + plate.h / 2;
    assert.equal(w.pointInCone(centerX, centerY), true);
    w.update();
    assert.equal(w.solved.has('r1'), false, 'pressed while covered does not latch');
    plate.isPressed = false;
    state.currentTick = 2;
    pushNoiseEvent(800, 320, 'decoy');
    let guard = 0;
    while (w.pointInCone(centerX, centerY) && guard < 80) { w.update(); guard++; }
    assert.equal(w.pointInCone(centerX, centerY), false);
    assert.equal(w.solved.has('r1'), false, 'turning away from an unpressed relay does not latch');
    plate.isPressed = true;
    w.update();
    assert.equal(w.solved.has('r1'), true);
});

check('checkpoint restores each relay and the door opens only when all three are done', () => {
    const w = freshWarden();
    const plates = [
        new PressurePlate('r1', 460, 128, []),
        new PressurePlate('r2', 300, 128, []),
        new PressurePlate('r3', 380, 100, [])
    ];
    state.plates = plates;
    const door = new Door('boss_door', 500, 450, 40, 70);
    door.isOpen = false;
    state.doors = [door];
    state.currentTick = 1;
    pushNoiseEvent(270, 95, 'decoy');
    for (let i = 0; i < 40; i++) w.update();
    plates[0].isPressed = true;
    w.update();
    assert.deepStrictEqual(state.bossCheckpoint.warden.relays, ['r1']);
    assert.equal(door.isOpen, false);

    state.bossCheckpointLive = true;
    const restored = new Warden(385, 305, {
        id: 'warden', coneLength: 340, coneAngle: 80, turnSpeed: 160,
        hearRange: 1000, homeAngle: -90, relayIds: ['r1', 'r2', 'r3'], defeatDoorId: 'boss_door',
        relaysPerLoop: 0
    });
    state.bossCheckpointLive = false;
    assert.equal(restored.solved.has('r1'), true);
    assert.equal(restored.solved.has('r2'), false);
    door.isOpen = false;
    restored.update();
    assert.equal(door.isOpen, false);

    state.currentTick = 10;
    pushNoiseEvent(530, 95, 'decoy');
    for (let i = 0; i < 40; i++) restored.update();
    plates[1].isPressed = true;
    restored.update();
    assert.equal(door.isOpen, false);
    state.currentTick = 20;
    pushNoiseEvent(186, 150, 'decoy');
    for (let i = 0; i < 50; i++) restored.update();
    plates[2].isPressed = true;
    restored.update();
    assert.equal(door.isOpen, true);
    assert.deepStrictEqual(state.bossCheckpoint.warden.relays, ['r1', 'r2', 'r3']);
    door.isOpen = false;
    restored.update();
    assert.equal(door.isOpen, true);
});

check('relaysPerLoop caps latches per loop; a new loop (checkpoint) allows the next', () => {
    const w = freshWarden();
    assert.equal(w.relaysPerLoop, 1, 'W3-MB default cap is one relay per loop');
    const plates = [
        new PressurePlate('r1', 460, 128, []),
        new PressurePlate('r3', 380, 100, [])
    ];
    state.plates = plates;
    state.currentTick = 1;
    pushNoiseEvent(186, 204, 'decoy');
    for (let i = 0; i < 60; i++) w.update();
    assert.equal(w.pointInCone(480, 148), false);
    assert.equal(w.pointInCone(400, 120), false);
    plates[0].isPressed = true;
    plates[1].isPressed = true;
    for (let i = 0; i < 10; i++) w.update();
    assert.equal(w.solved.size, 1, 'only one relay latches in the loop');
    state.bossCheckpointLive = true;
    const next = new Warden(385, 305, { id: 'warden', relayIds: ['r1', 'r2', 'r3'] });
    state.bossCheckpointLive = false;
    assert.equal(next.solved.size, 1);
    state.currentTick = 2;
    pushNoiseEvent(186, 204, 'decoy');
    for (let i = 0; i < 60; i++) next.update();
    assert.equal(next.solved.size, 2, 'the next loop latches the second relay');
});

check('an empty relay list does not open the defeat door', () => {
    const w = freshWarden({ relayIds: [] });
    const door = new Door('boss_door', 0, 0, 40, 40);
    door.isOpen = false;
    state.doors = [door];
    w.update();
    assert.equal(door.isOpen, false);
});

check('two wardens given the same noises stay on the same facing', () => {
    function run() {
        resetWorld();
        const a = new Warden(385, 305, { id: 'a', homeAngle: -90, turnSpeed: 160, hearRange: 1000 });
        const b = new Warden(385, 305, { id: 'b', homeAngle: -90, turnSpeed: 160, hearRange: 1000 });
        const angles = [];
        for (let t = 0; t < 36; t++) {
            state.currentTick = t;
            if (t === 4) pushNoiseEvent(200, 80, 'decoy');
            if (t === 18) pushNoiseEvent(700, 500, 'alarm');
            a.update();
            b.update();
            assert.equal(a.facingAngle, b.facingAngle);
            angles.push(a.facingAngle);
        }
        return angles;
    }
    const first = run();
    const second = run();
    assert.deepStrictEqual(second, first);
});

check('decoy landing pulls a guard; interact noise and a far landing do not', () => {
    resetWorld();
    const g = new Guard([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    state.currentTick = 1;
    pushNoiseEvent(80, 0, 'interact');
    g.update(far, []);
    assert.equal(g.state, 'patrol');
    pushNoiseEvent(900, 0, 'decoy');
    g.update(far, []);
    assert.equal(g.state, 'patrol');
    state.currentTick = 2;
    pushNoiseEvent(120, 0, 'decoy');
    const before = g.x;
    g.update(far, []);
    assert.equal(g.state, 'investigate');
    assert.ok(g.x > before);
});

check('a guard does not step onto a broken crack and skips that waypoint', () => {
    resetWorld();
    const g = new Guard([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const crack = new CrackedFloor(60, 0, 40, 40, 'fast');
    crack.broken = true;
    state.cracks = [crack];
    for (let i = 0; i < 40; i++) g.update(far, []);
    assert.ok(g.x + g.w <= crack.x || g.x >= crack.x + crack.w, `guard crossed the crack at x=${g.x}`);
    const posted = new Guard([{ x: 0, y: 0 }, { x: 60, y: 0 }]);
    for (let i = 0; i < 10; i++) posted.update(far, []);
    assert.equal(posted.x, 0);
    assert.equal(posted.y, 0);
});

process.exit(failures ? 1 : 0);
