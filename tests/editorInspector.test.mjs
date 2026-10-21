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
const { applyInspectorEdits, addWaypoint, removeWaypoint, degToRad } = await import('../src/ui/editorInspector.js');

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

test('camera angle + sweep apply live and round-trip', () => {
    const s = base(); const c = s.cameras[0];
    applyInspectorEdits(c, { baseAngle: degToRad(180), sweepRange: degToRad(30) });
    assert.equal(c.baseAngle, Math.PI);
    assert.equal(c.currentAngle, Math.PI);
    const t = roundTrip(s).cameras[0];
    assert.ok(Math.abs(t.baseAngle - Math.PI) < 1e-9);
    assert.ok(Math.abs(t.sweepRange - Math.PI / 6) < 1e-9);
});

console.log(`\n${passed} tests passed`);
