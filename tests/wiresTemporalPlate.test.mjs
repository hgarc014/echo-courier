// PR4: wires + TemporalPlate modes round-trip, `last` mode logic, hazard prediction.
// Run: node tests/wiresTemporalPlate.test.mjs   (no dependencies)
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const ctxStub = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, getContext: () => ctxStub, addEventListener() {}, appendChild() {}, setAttribute() {}, width: 0, height: 0, checked: false, value: '' });
globalThis.document = { createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el() };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.Image = class { set src(_) {} };
globalThis.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); } pause() {} addEventListener() {} };
globalThis.AudioContext = class { createGain() { return { connect() {}, gain: { value: 0 } }; } };
globalThis.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { state } = await import('../src/core/state.js');
const { serializeLevel, deserializeLevel } = await import('../src/data/levels.js');
const { TemporalPlate, PressurePlate, Door } = await import('../src/entities/interactables.js');
const { Laser } = await import('../src/entities/hazards.js');
const { pickTemporalActor, lastGhostId, firstGhostId, normalizeTimeline, TEMPORAL_MODES } = await import('../src/systems/temporalPlate.js');
const { collectWires } = await import('../src/systems/wires.js');
const { predictEchoHazards, sampleRun } = await import('../src/systems/preview.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

function buildLevel() {
    return {
        mapWidth: 800, mapHeight: 600,
        player: { x: 50, y: 50 }, deliveryZone: { x: 650, y: 300, w: 100, h: 100 },
        walls: [], hints: [], packages: [], guards: [], cameras: [], drones: [], winds: [], statics: [], cracks: [], robots: [],
        doors: [new Door('d1', 300, 100, 40, 80), new Door('d2', 400, 100, 40, 80)],
        lasers: [new Laser('l1', 500, 100, 20, 80)],
        plates: [
            new PressurePlate('p_std', 100, 100, ['d1', 'l1']),
            new TemporalPlate('p_present', 100, 200, 'd2', 'present'),
            new TemporalPlate('p_first', 100, 300, ['d1'], 'first'),
            new TemporalPlate('p_last', 100, 400, ['l1', 'd2'], 'last')
        ]
    };
}

test('serialize -> JSON -> deserialize keeps wires (linkedIds) and TemporalPlate modes', () => {
    const src = buildLevel();
    const json = JSON.stringify(serializeLevel(src));        // JSON export
    const back = deserializeLevel(JSON.parse(json));          // JSON import / save-load
    const plates = back.plates.map(p => ({ id: p.id, temporal: p instanceof TemporalPlate, mode: p.requiredTimeline, links: p.linkedIds }));
    assert.deepEqual(plates, [
        { id: 'p_std', temporal: false, mode: undefined, links: ['d1', 'l1'] },
        { id: 'p_present', temporal: true, mode: 'present', links: ['d2'] },
        { id: 'p_first', temporal: true, mode: 'first', links: ['d1'] },
        { id: 'p_last', temporal: true, mode: 'last', links: ['l1', 'd2'] }
    ]);
    const wiresBefore = collectWires(src.plates, src.doors, src.lasers).map(w => `${w.plateId}->${w.kind}:${w.targetId}`);
    const wiresAfter = collectWires(back.plates, back.doors, back.lasers).map(w => `${w.plateId}->${w.kind}:${w.targetId}`);
    assert.deepEqual(wiresAfter, wiresBefore);
    assert.deepEqual(wiresBefore, ['p_std->door:d1', 'p_std->laser:l1', 'p_present->door:d2', 'p_first->door:d1', 'p_last->laser:l1', 'p_last->door:d2']);
    // second round-trip is stable
    assert.deepEqual(JSON.parse(JSON.stringify(serializeLevel(back).plates)), JSON.parse(json).plates);
});

test('unknown/missing timeline normalizes to present', () => {
    assert.equal(normalizeTimeline('bogus'), 'present');
    assert.equal(new TemporalPlate('x', 0, 0, 'd', undefined).requiredTimeline, 'present');
    assert.deepEqual(TEMPORAL_MODES, ['present', 'first', 'last']);
});

test('wires skip dangling ids and reflect plate power', () => {
    const p = new PressurePlate('p', 0, 0, ['nope', 'd1']); p.isPressed = true;
    const w = collectWires([p], [new Door('d1', 100, 0, 40, 40)], []);
    assert.equal(w.length, 1); assert.equal(w[0].powered, true);
    assert.deepEqual([w[0].x1, w[0].y1, w[0].x2, w[0].y2], [20, 20, 120, 20]);
});

test('`last` resolves to newest ghost id after maxGhosts pruning', () => {
    const player = { id: undefined, assetName: 'player' };
    // After pruning, ids may not start at 0 / be dense; newest = highest id.
    const ghosts = [{ id: 1, isActive: true }, { id: 2, isActive: true }, { id: 4, isActive: true }];
    assert.equal(lastGhostId(ghosts), 4);
    assert.equal(firstGhostId(ghosts), 1);
    const actors = [player, ...ghosts];
    assert.equal(pickTemporalActor('last', actors, ghosts).id, 4);
    assert.equal(pickTemporalActor('first', actors, ghosts).id, 1);
    assert.equal(pickTemporalActor('present', actors, ghosts), player);
    // Newest echo inactive (fell): it is not in actors, so nobody else may stand in for it.
    assert.equal(pickTemporalActor('last', [player, ghosts[0], ghosts[1]], ghosts), null);
    assert.equal(pickTemporalActor('last', [player], []), null);
});

test('TemporalPlate.update presses only for the matching actor', () => {
    const plate = new TemporalPlate('t', 0, 0, 'd', 'last');
    const g0 = { id: 0, x: 0, y: 0, w: 30, h: 30, isActive: true };
    const g1 = { id: 1, x: 200, y: 200, w: 30, h: 30, isActive: true };
    state.activeGhosts = [g0, g1];
    plate.update([g0, g1]);
    assert.equal(plate.isPressed, false, 'oldest echo on a last plate must not press');
    g1.x = 5; g1.y = 5; plate.update([g0, g1]);
    assert.equal(plate.isPressed, true);
    state.activeGhosts = [];
});

test('hazard preview flags a future laser and camera hit', () => {
    const run = Array.from({ length: 60 }, (_, i) => ({ x: i * 10, y: 100 }));
    const ghost = { id: 0, isActive: true, localTick: 0, w: 30, h: 30, runData: run };
    const laser = { x: 300, y: 80, w: 20, h: 80, isOpen: false };
    const hits = predictEchoHazards([ghost], [], [laser]);
    assert.equal(hits.length, 1); assert.equal(hits[0].kind, 'laser');
    assert.ok(hits[0].x + 30 > 300 && hits[0].x < 320);
    assert.equal(predictEchoHazards([ghost], [], [{ ...laser, isOpen: true }]).length, 0);
    const cam = { x: 400, y: 100, baseAngle: Math.PI, sweepRange: 0, sweepProgress: 0, sweepDir: 0.01, trackingPlayer: false };
    const camHits = predictEchoHazards([ghost], [cam], []);
    assert.equal(camHits[0].kind, 'camera');
    assert.deepEqual(sampleRun(run, 999), run[59]);
});

console.log(`\n${passed} tests passed`);
