// Gatekeeper audits: pass, lock, vault, checkpoint skip, and JSON round-trip.
// Run: node tests/gatekeeper.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();
const { state } = await import('../src/core/state.js');
const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { Gatekeeper } = await import('../src/entities/bosses/gatekeeper.js');

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
});

console.log(`\n${passed} tests passed`);
