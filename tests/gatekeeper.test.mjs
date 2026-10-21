// Gatekeeper audits: pass, lock, vault, checkpoint skip, and JSON round-trip.
// Run: node tests/gatekeeper.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { Gatekeeper, normalizeFreshTicks, wallRayDistance, GATEKEEPER_WINDUP_TICKS, auditWarningInk } = await import('../src/entities/bosses/gatekeeper.js');
const { PressurePlate } = await import('../src/entities/interactables.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

function resetAttempt() {
    state.gameState = 'PLAYING';
    state.gatekeeperCheckpoint = {};
    state.currentTick = 0;
}

function gk(opts) {
    return new Gatekeeper('gk', 100, 80, {
        audits: [
            { plateId: 'p1', tick: 100 },
            { plateId: 'p2', tick: 200 }
        ],
        vaultDoorId: 'vault',
        ...opts
    });
}

test('pressed plate breaks a shield; empty plate locks linked doors', () => {
    resetAttempt();
    const g = gk();
    const locked = { id: 'd1', isOpen: true };
    const vault = { id: 'vault', isOpen: false };
    g.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'] }], [locked, vault]);
    assert.deepEqual(g.passed, [0]);
    assert.equal(g.shields, 1);
    assert.equal(locked.gateLocked, undefined);
    assert.equal(vault.isOpen, false);
    assert.deepEqual(state.gatekeeperCheckpoint.gk, [0]);

    const missed = { id: 'd2', isOpen: true };
    g.update(200, [{ id: 'p2', isPressed: false, linkedIds: ['d2'] }], [missed, vault]);
    assert.equal(missed.gateLocked, true);
    assert.equal(g.shields, 1);
    assert.deepEqual(g.passed, [0]);
    assert.equal(vault.isOpen, false);
    g.update(201, [{ id: 'p2', isPressed: true, linkedIds: ['d2'] }], [missed, vault]);
    assert.equal(missed.gateLocked, true, 'lock lasts the rest of the loop');
});

test('all audits passed opens the vault and keeps it open', () => {
    resetAttempt();
    const g = gk();
    const vault = { id: 'vault', isOpen: false };
    const doors = [{ id: 'd1' }, { id: 'd2' }, vault];
    g.update(100, [
        { id: 'p1', isPressed: true, linkedIds: ['d1'] },
        { id: 'p2', isPressed: false, linkedIds: ['d2'] }
    ], doors);
    g.update(200, [
        { id: 'p1', isPressed: false, linkedIds: ['d1'] },
        { id: 'p2', isPressed: true, linkedIds: ['d2'] }
    ], doors);
    assert.equal(g.shields, 0);
    assert.deepEqual(g.passed, [0, 1]);
    assert.equal(vault.isOpen, true);
    vault.isOpen = false;
    g.update(240, [], doors);
    assert.equal(vault.isOpen, true);
});

test('shields reaching 0 opens the vault before every audit has passed', () => {
    resetAttempt();
    const g = gk({ shields: 1 });
    const vault = { id: 'vault', isOpen: false };
    g.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'] }], [vault]);
    assert.equal(g.shields, 0);
    assert.equal(g.passed.length, 1);
    assert.equal(vault.isOpen, true);
});

test('checkpoint skips passed audits on the next loop and does not lock them', () => {
    resetAttempt();
    const first = gk();
    first.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'] }], [{ id: 'vault', isOpen: false }]);
    assert.deepEqual(state.gatekeeperCheckpoint.gk, [0]);

    const second = gk();
    assert.deepEqual(second.passed, [0]);
    assert.equal(second.shields, 1);
    assert.equal(second.maxShields, 2);
    const door = { id: 'd1', isOpen: true };
    second.update(100, [{ id: 'p1', isPressed: false, linkedIds: ['d1'] }], [door]);
    assert.notEqual(door.gateLocked, true);
    assert.equal(second.shields, 1);

    const third = gk();
    assert.equal(third.shields, 1, 'restore does not decrement twice');
});

test('editor construction ignores the checkpoint', () => {
    resetAttempt();
    state.gatekeeperCheckpoint = { gk: [0] };
    state.gameState = 'EDITOR';
    const g = gk();
    assert.deepEqual(g.passed, []);
    assert.equal(g.shields, 2);
    assert.equal(g.w, 60);
    assert.equal(g.h, 60);
});

test('render telegraph does not throw', () => {
    resetAttempt();
    state.currentTick = 80;
    state.plates = [{ id: 'p1', x: 240, y: 200, w: 40, h: 40, isPressed: false, linkedIds: ['d1'] }];
    state.doors = [{ id: 'vault', x: 400, y: 120, w: 40, h: 80, isOpen: false }];
    const g = gk();
    g.flashTicks = 12;
    const fn = () => ({});
    const ctx = new Proxy(function () {}, { get: () => fn, set: () => true, apply: () => ctx });
    g.render(ctx);
    state.plates = [];
    state.doors = [];
});

test('gatekeeper JSON export/import round-trips', () => {
    resetAttempt();
    state.editorLevelMeta = {
        name: 'Gate Room',
        story: { speaker: '', text: '' },
        obj: '',
        grants: [],
        maxGhosts: 2,
        crackSpeed: 'normal'
    };
    const src = {
        width: 800,
        height: 600,
        player: { x: 40, y: 40 },
        deliveryZone: { x: 600, y: 400, w: 100, h: 100 },
        doors: [
            { id: 'd1', x: 100, y: 100, w: 40, h: 80, type: 'standard' },
            { id: 'vault', x: 500, y: 200, w: 40, h: 80, type: 'standard' }
        ],
        plates: [
            { id: 'p1', x: 80, y: 80, linkedIds: ['d1'], type: 'standard' },
            { id: 'p2', x: 160, y: 80, linkedIds: ['d1'], type: 'standard' }
        ],
        gatekeepers: [
            {
                id: 'gk-default', x: 300, y: 300,
                audits: [{ plateId: 'p1', tick: 120 }, { plateId: 'p2', tick: 240 }],
                vaultDoorId: 'vault'
            },
            {
                id: 'gk-custom', x: 320, y: 300,
                audits: [{ plateId: 'p1', tick: 120 }, { plateId: 'p2', tick: 240 }],
                vaultDoorId: 'vault',
                shields: 1
            }
        ]
    };
    const first = serializeLevel(deserializeLevel(src));
    const json = JSON.parse(JSON.stringify(first));
    assert.equal(json.gatekeepers[0].shields, undefined);
    assert.equal(json.gatekeepers[1].shields, 1);
    assert.equal(json.gatekeepers[0].vaultDoorId, 'vault');
    assert.deepEqual(json.gatekeepers[0].audits, [{ plateId: 'p1', tick: 120 }, { plateId: 'p2', tick: 240 }]);
    const back = deserializeLevel(json);
    assert.equal(back.gatekeepers[0].constructor.name, 'Gatekeeper');
    assert.equal(back.gatekeepers[0].shields, 2);
    assert.equal(back.gatekeepers[0].maxShields, 2);
    assert.equal(back.gatekeepers[1].shields, 1);
    assert.equal(back.gatekeepers[1].maxShields, 1);
    assert.equal(back.gatekeepers[0].w, 60);
    const second = serializeLevel(back);
    assert.deepEqual(JSON.parse(JSON.stringify(second)), json);
    assert.equal(json.gatekeepers[0].freshTicks, undefined);
    assert.equal(back.gatekeepers[0].freshTicks, null);
});

test('pressure plate records arrival, keeps it, and clears it on leave', () => {
    resetAttempt();
    const plate = new PressurePlate('p1', 100, 100, ['d1']);
    const actor = { id: 0, x: 100, y: 100, w: 30, h: 30, isActive: true };
    const gone = { id: 'idle', x: 0, y: 0, w: 30, h: 30, isActive: false };
    const carried = { id: 'pkg', x: 100, y: 100, w: 30, h: 30, carriedBy: 'player' };
    state.currentTick = 40;
    plate.update([gone, actor], [carried]);
    assert.equal(plate.isPressed, true);
    assert.deepEqual(plate.arrivalTicks, [40]);
    state.currentTick = 55;
    plate.update([actor], []);
    assert.deepEqual(plate.arrivalTicks, [40]);
    actor.x = 400;
    plate.update([actor], []);
    assert.equal(plate.isPressed, false);
    assert.deepEqual(plate.arrivalTicks, []);
    state.currentTick = 70;
    actor.x = 100;
    plate.update([actor], []);
    assert.deepEqual(plate.arrivalTicks, [70]);
});

test('freshTicks null still passes on isPressed; a set window fails closed without arrivals', () => {
    resetAttempt();
    const legacy = gk();
    assert.equal(legacy.freshTicks, null);
    legacy.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'] }], [{ id: 'vault', isOpen: false }]);
    assert.deepEqual(legacy.passed, [0]);

    resetAttempt();
    const strict = gk({ freshTicks: 40 });
    const door = { id: 'd1', isOpen: true };
    strict.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'] }], [door]);
    assert.deepEqual(strict.passed, []);
    assert.equal(door.gateLocked, true);
});

test('fresh hold passes only after the previous audit and inside the window', () => {
    resetAttempt();
    const g = gk({ freshTicks: 30 });
    const vault = { id: 'vault', isOpen: false };
    const early = { id: 'd1', isOpen: true };
    g.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'], arrivalTicks: [50] }], [early, vault]);
    assert.deepEqual(g.passed, []);
    assert.equal(early.gateLocked, true);
    assert.equal(vault.isOpen, false);

    const again = gk({ freshTicks: 30 });
    again.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'], arrivalTicks: [80] }], [vault]);
    assert.deepEqual(again.passed, [0]);
    const beforePrev = { id: 'd2', isOpen: true };
    again.update(200, [{ id: 'p2', isPressed: true, linkedIds: ['d2'], arrivalTicks: [100] }], [beforePrev, vault]);
    assert.equal(beforePrev.gateLocked, true, 'arrival on the previous audit tick is not fresh');
    const tooEarly = { id: 'd2', isOpen: true };
    again.update(200, [{ id: 'p2', isPressed: true, linkedIds: ['d2'], arrivalTicks: [150] }], [tooEarly, vault]);
    assert.equal(tooEarly.gateLocked, true);
    assert.deepEqual(again.passed, [0]);
    again.update(200, [{ id: 'p2', isPressed: true, linkedIds: ['d2'], arrivalTicks: [180] }], [vault]);
    assert.deepEqual(again.passed, [0, 1]);
    assert.equal(vault.isOpen, true);
});

test('freshTicks 0 accepts only an arrival on the audit tick', () => {
    resetAttempt();
    const miss = gk({ freshTicks: 0 });
    const door = { id: 'd1', isOpen: true };
    miss.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'], arrivalTicks: [100 - 1] }], [door]);
    assert.equal(door.gateLocked, true);
    const hit = gk({ freshTicks: 0 });
    hit.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'], arrivalTicks: [100] }], [{ id: 'vault', isOpen: false }]);
    assert.deepEqual(hit.passed, [0]);
});

test('a checkpointed audit is not re-judged for freshness', () => {
    resetAttempt();
    state.gatekeeperCheckpoint = { gk: [0] };
    const g = gk({ freshTicks: 20 });
    const door = { id: 'd1', isOpen: true };
    g.update(100, [{ id: 'p1', isPressed: true, linkedIds: ['d1'], arrivalTicks: [1] }], [door]);
    assert.notEqual(door.gateLocked, true);
    assert.deepEqual(g.passed, [0]);
});

test('normalizeFreshTicks keeps 0 and rejects blank or negative', () => {
    assert.equal(normalizeFreshTicks(0), 0);
    assert.equal(normalizeFreshTicks('0'), 0);
    assert.equal(normalizeFreshTicks(90.8), 90);
    assert.equal(normalizeFreshTicks(''), null);
    assert.equal(normalizeFreshTicks('  '), null);
    assert.equal(normalizeFreshTicks(null), null);
    assert.equal(normalizeFreshTicks(-1), null);
    assert.equal(normalizeFreshTicks('nope'), null);
});

test('audit wind-up is between 90 and 120 ticks', () => {
    assert.ok(GATEKEEPER_WINDUP_TICKS >= 90 && GATEKEEPER_WINDUP_TICKS <= 120);
});

test('audit warning is strong from its first frame through the opening 0.6s', () => {
    assert.equal(auditWarningInk(0), null);
    assert.equal(auditWarningInk(GATEKEEPER_WINDUP_TICKS + 1), null);
    for (let elapsed = 0; elapsed <= 36; elapsed++) {
        const ink = auditWarningInk(GATEKEEPER_WINDUP_TICKS - elapsed);
        assert.ok(ink, `missing ink at +${elapsed}`);
        assert.ok(ink.fill >= 0.3, `fill faint at +${elapsed}: ${ink.fill}`);
        assert.ok(ink.stroke >= 0.8, `stroke faint at +${elapsed}: ${ink.stroke}`);
    }
    const first = auditWarningInk(GATEKEEPER_WINDUP_TICKS);
    assert.ok(first.fill >= 0.4, 'first frame should be the bright half of the flash');
});

test('render paints a strong warning beam on the first wind-up frame', () => {
    resetAttempt();
    state.currentTick = 100 - GATEKEEPER_WINDUP_TICKS;
    state.plates = [{ id: 'p1', x: 240, y: 200, w: 40, h: 40 }];
    state.doors = [];
    state.walls = [];
    const g = gk();
    const fills = [];
    const ctx = new Proxy(function () {}, {
        get: () => () => {},
        set(_t, key, value) {
            if (key === 'fillStyle') fills.push(String(value));
            return true;
        },
        apply: () => ctx
    });
    g.render(ctx);
    const beam = fills.find(s => s.includes('255, 60, 40'));
    assert.ok(beam, `warning wedge missing: ${fills.join(' | ')}`);
    const alpha = Number(beam.slice(beam.lastIndexOf(',') + 1).replace(')', ''));
    assert.ok(alpha >= 0.3, beam);
    state.plates = [];
});

test('wall ray stops at the first wall and ignores anything that is not a wall', () => {
    const near = { x: 80, y: 0, w: 10, h: 50 };
    const far = { x: 200, y: 0, w: 10, h: 50 };
    const hit = wallRayDistance(0, 25, 0, 500, [far, near]);
    assert.ok(Math.abs(hit - 80) < 1e-6);
    assert.equal(wallRayDistance(0, 25, 0, 500, []), 500);
    assert.equal(wallRayDistance(0, 80, 0, 500, [near]), 500, 'a ray that misses the wall runs to maxDist');
    assert.equal(wallRayDistance(0, 25, Math.PI, 40, [near]), 40, 'a ray aimed away from the wall is not clipped');
});

test('render draws plate labels and does not throw when a wall blocks the wedge', () => {
    resetAttempt();
    state.currentTick = 80;
    state.plates = [
        { id: 'p1', x: 240, y: 200, w: 40, h: 40 },
        { id: 'p2', x: 320, y: 200, w: 40, h: 40 }
    ];
    state.doors = [{ id: 'vault', x: 400, y: 120, w: 40, h: 80, isOpen: false }];
    state.walls = [{ x: 150, y: 0, w: 20, h: 400 }];
    const g = gk();
    const texts = [];
    const fn = () => ({});
    const ctx = new Proxy(function () {}, {
        get: (_t, key) => {
            if (key === 'fillText' || key === 'strokeText') return (text) => { texts.push(String(text)); };
            return fn;
        },
        set: () => true,
        apply: () => ctx
    });
    g.render(ctx);
    assert.ok(texts.includes('p1'));
    assert.ok(texts.includes('p2'));
    state.plates = [];
    state.doors = [];
    state.walls = [];
});

test('freshTicks 0 survives JSON and a missing freshTicks stays omitted', () => {
    resetAttempt();
    state.editorLevelMeta = {
        name: 'Fresh Room',
        story: { speaker: '', text: '' },
        obj: '',
        grants: [],
        maxGhosts: 2,
        crackSpeed: 'normal'
    };
    const src = {
        width: 800,
        height: 600,
        player: { x: 40, y: 40 },
        deliveryZone: { x: 600, y: 400, w: 100, h: 100 },
        gatekeepers: [
            { id: 'zero', x: 10, y: 20, audits: [{ plateId: 'p', tick: 60 }], vaultDoorId: 'v', freshTicks: 0 },
            { id: 'off', x: 30, y: 20, audits: [{ plateId: 'p', tick: 60 }], vaultDoorId: 'v', freshTicks: null }
        ]
    };
    const json = JSON.parse(JSON.stringify(serializeLevel(deserializeLevel(src))));
    assert.equal(json.gatekeepers[0].freshTicks, 0);
    assert.equal(json.gatekeepers[1].freshTicks, undefined);
    const back = deserializeLevel(json);
    assert.equal(back.gatekeepers[0].freshTicks, 0);
    assert.equal(back.gatekeepers[1].freshTicks, null);
    const again = JSON.parse(JSON.stringify(serializeLevel(back)));
    assert.deepEqual(again.gatekeepers.map(g => g.freshTicks), [0, undefined]);
});

console.log(`\n${passed} tests passed`);
