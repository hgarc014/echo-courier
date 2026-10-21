// Run: node tests/editorInspector.test.mjs  (no deps)
import assert from 'node:assert/strict';

// Minimal browser stubs so levels.js (and its sprite/atlas imports) load in Node.
const noopEl = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : noopEl(), apply: () => noopEl(), construct: () => noopEl(), set: () => true });
globalThis.document = noopEl();
globalThis.window = globalThis.window || globalThis;
globalThis.Image = class { set src(v) {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.Audio = class { play() { return Promise.resolve(); } };
globalThis.AudioContext = globalThis.webkitAudioContext = class { constructor() { return noopEl(); } };

const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { applyInspectorEdits, addWaypoint, removeWaypoint, degToRad, setAudits, addAudit, removeAudit, applyGatekeeperEdits } = await import('../src/ui/editorInspector.js');

const roundTrip = (setup) => deserializeLevel(JSON.parse(JSON.stringify(serializeLevel(setup))));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

const base = () => deserializeLevel({
    robots: [{ path: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }],
    guards: [{ path: [{ x: 300, y: 300 }, { x: 350, y: 300 }] }],
    drones: [{ path: [{ x: 400, y: 400 }, { x: 460, y: 400 }] }],
    cameras: [{ x: 500, y: 40, baseAngle: Math.PI / 2, sweepRange: Math.PI / 4 }]
});

test('moving a robot via inspector translates its path and survives round-trip', () => {
    const s = base(); const r = s.robots[0];
    applyInspectorEdits(r, { x: 150, y: 250 });
    assert.deepEqual([r.x, r.y], [150, 250]);
    assert.deepEqual(r.path, [{ x: 150, y: 250 }, { x: 250, y: 250 }]);
    const r2 = roundTrip(s).robots[0];
    assert.deepEqual([r2.x, r2.y], [150, 250]);
    assert.deepEqual(r2.path, [{ x: 150, y: 250 }, { x: 250, y: 250 }]);
});

test('moving guards/drones translates points and resets spawn', () => {
    const s = base();
    applyInspectorEdits(s.guards[0], { x: 310, y: 320 });
    applyInspectorEdits(s.drones[0], { x: 0, y: 0 });
    assert.equal(s.guards[0].startX, 310);
    assert.deepEqual(s.guards[0].points[1], { x: 360, y: 320 });
    const t = roundTrip(s);
    assert.deepEqual(t.guards[0].points, [{ x: 310, y: 320 }, { x: 360, y: 320 }]);
    assert.deepEqual(t.drones[0].points, [{ x: 0, y: 0 }, { x: 60, y: 0 }]);
    assert.deepEqual([t.drones[0].x, t.drones[0].y], [0, 0]);
});

test('waypoint edit/add/remove round-trips for guard, drone, robot', () => {
    const s = base();
    applyInspectorEdits(s.guards[0], { waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }] });
    addWaypoint(s.drones[0]);
    applyInspectorEdits(s.robots[0], { waypoints: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] });
    assert.ok(removeWaypoint(s.robots[0], 1));
    assert.equal(removeWaypoint(s.robots[0], 0), false, 'keeps min 2 waypoints');
    assert.deepEqual([s.guards[0].x, s.guards[0].y], [10, 20]);
    const t = roundTrip(s);
    assert.deepEqual(t.guards[0].points, [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]);
    assert.deepEqual(t.drones[0].points, [{ x: 400, y: 400 }, { x: 460, y: 400 }, { x: 500, y: 400 }]);
    assert.deepEqual(t.robots[0].path, [{ x: 1, y: 2 }, { x: 5, y: 6 }]);
});

test('waypoint edit then X/Y move applies both in order', () => {
    const s = base(); const g = s.guards[0];
    applyInspectorEdits(g, { waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }], x: 100, y: 100 });
    assert.deepEqual(g.points, [{ x: 100, y: 100 }, { x: 110, y: 100 }]);
});

test('gatekeeper audit helpers edit the schedule and round-trip', () => {
    const gk = { id: 'g', audits: [], vaultDoorId: '', shields: 0, maxShields: 0 };
    assert.equal(setAudits(gk, [{ plateId: 'p1', tick: 30 }, { plateId: 'p2', tick: 'nope' }]), true);
    assert.deepEqual(gk.audits, [{ plateId: 'p1', tick: 30 }]);
    assert.equal(addAudit(gk, { plateId: 'p2', tick: 90 }), true);
    assert.equal(removeAudit(gk, 0), true);
    assert.deepEqual(gk.audits, [{ plateId: 'p2', tick: 90 }]);
    assert.equal(removeAudit(gk, 3), false);
    assert.equal(setAudits(null, []), false);
    applyGatekeeperEdits(gk, {
        id: 'gk',
        vaultDoorId: 'vault',
        shields: 5,
        audits: [{ plateId: 'a', tick: 10 }, { plateId: 'b', tick: 20 }]
    });
    assert.equal(gk.id, 'gk');
    assert.equal(gk.vaultDoorId, 'vault');
    assert.equal(gk.maxShields, 5);
    assert.equal(gk.shields, 5);
    assert.deepEqual(gk.audits, [{ plateId: 'a', tick: 10 }, { plateId: 'b', tick: 20 }]);
    applyGatekeeperEdits(gk, { shields: -2 });
    assert.equal(gk.shields, 0);
    assert.equal(gk.maxShields, 0);

    const world = deserializeLevel({
        gatekeepers: [{ id: 'gk', x: 10, y: 20, audits: [], vaultDoorId: '' }]
    });
    const ent = world.gatekeepers[0];
    applyGatekeeperEdits(ent, { vaultDoorId: 'v', shields: 1, audits: [{ plateId: 'p', tick: 60 }] });
    const again = roundTrip(world).gatekeepers[0];
    assert.equal(again.vaultDoorId, 'v');
    assert.equal(again.maxShields, 1);
    assert.equal(again.shields, 1);
    assert.deepEqual(again.audits, [{ plateId: 'p', tick: 60 }]);
    assert.equal(again.x, 10);
    assert.equal(again.y, 20);
});

test('gatekeeper freshTicks 0 and blank round-trip through the inspector', () => {
    const world = deserializeLevel({
        gatekeepers: [{ id: 'gk', x: 10, y: 20, audits: [{ plateId: 'p', tick: 60 }], vaultDoorId: 'v' }]
    });
    const ent = world.gatekeepers[0];
    assert.equal(ent.freshTicks, null);
    applyGatekeeperEdits(ent, { freshTicks: 0 });
    assert.equal(ent.freshTicks, 0);
    let json = JSON.parse(JSON.stringify(serializeLevel(world)));
    assert.equal(json.gatekeepers[0].freshTicks, 0);
    let again = deserializeLevel(json).gatekeepers[0];
    assert.equal(again.freshTicks, 0);

    const world90 = deserializeLevel(json);
    applyGatekeeperEdits(world90.gatekeepers[0], { freshTicks: 90 });
    json = JSON.parse(JSON.stringify(serializeLevel(world90)));
    assert.equal(json.gatekeepers[0].freshTicks, 90);
    again = deserializeLevel(json).gatekeepers[0];
    assert.equal(again.freshTicks, 90);

    const worldOff = deserializeLevel(json);
    applyGatekeeperEdits(worldOff.gatekeepers[0], { freshTicks: '' });
    assert.equal(worldOff.gatekeepers[0].freshTicks, null);
    json = JSON.parse(JSON.stringify(serializeLevel(worldOff)));
    assert.equal(json.gatekeepers[0].freshTicks, undefined);
    applyGatekeeperEdits(worldOff.gatekeepers[0], { freshTicks: -3 });
    assert.equal(worldOff.gatekeepers[0].freshTicks, null);
});

test('camera angle + sweep apply live and round-trip', () => {
    const s = base(); const c = s.cameras[0];
    applyInspectorEdits(c, { baseAngle: degToRad(180), sweepRange: degToRad(30) });
    assert.equal(c.baseAngle, Math.PI);
    assert.equal(c.currentAngle, Math.PI);
    const t = roundTrip(s).cameras[0];
    assert.ok(Math.abs(t.baseAngle - Math.PI) < 1e-9);
    assert.ok(Math.abs(t.sweepRange - Math.PI / 6) < 1e-9);
});

test('camera sweep 0 applies live, serializes, and deserializes as 0', () => {
    const s = base(); const c = s.cameras[0];
    assert.ok(c.sweepRange > 0);
    applyInspectorEdits(c, { baseAngle: 0, sweepRange: 0 });
    assert.equal(c.baseAngle, 0);
    assert.equal(c.sweepRange, 0);
    assert.equal(c.currentAngle, 0);
    assert.equal(c.sweepProgress, 0);
    const json = JSON.parse(JSON.stringify(serializeLevel(s)));
    assert.equal(json.cameras[0].baseAngle, 0);
    assert.equal(json.cameras[0].sweepRange, 0);
    const again = deserializeLevel(json).cameras[0];
    assert.equal(again.baseAngle, 0);
    assert.equal(again.sweepRange, 0);
    applyInspectorEdits(again, { sweepRange: -0.2 });
    assert.equal(again.sweepRange, 0, 'negative sweep stays ignored');
});

console.log(`\n${passed} tests passed`);
