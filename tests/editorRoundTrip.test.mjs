// Round-trip every LEVELS entry through the editor's serialize/deserialize path.
// Run: node tests/editorRoundTrip.test.mjs   (no dependencies)
import assert from 'node:assert/strict';

// Minimal browser stubs so game modules import under Node.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};
const ctxStub = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
const el = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getContext: () => ctxStub, addEventListener() {}, appendChild() {}, setAttribute() {},
    width: 0, height: 0, checked: false, value: ''
});
globalThis.document = { createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: el() };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.Image = class { set src(_) {} };
globalThis.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); } pause() {} addEventListener() {} };
globalThis.AudioContext = class { createGain() { return { connect() {}, gain: { value: 0 } }; } };
globalThis.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { state } = await import('../src/core/state.js');
const { LEVELS, getLevelSetup, serializeLevel, deserializeLevel, normalizeLoopTime } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');

let failures = 0;
for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    try {
        // Same path as "load campaign level into editor".
        const setup = getLevelSetup(i);
        setEditorLevelMetaFromLevel(level);
        const first = serializeLevel({ ...setup, meta: state.editorLevelMeta });
        const json = JSON.parse(JSON.stringify(first));
        const data = deserializeLevel(json);
        const second = serializeLevel({ ...data, meta: state.editorLevelMeta });
        assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), json, 'serialize/deserialize not idempotent');

        const m = second.meta;
        assert.equal(m.world, level.world, 'world');
        assert.deepEqual(m.unlocks, level.unlocks, 'unlocks');
        assert.deepEqual(m.grants, level.grants || [], 'grants');
        assert.equal(m.loopTime, normalizeLoopTime(level.loopTime) ?? undefined, 'loopTime');
        assert.equal(m.maxGhosts, level.maxGhosts ?? 3, 'maxGhosts');
        assert.equal(second.mapWidth, setup.mapWidth, 'mapWidth');
        assert.equal(second.mapHeight, setup.mapHeight, 'mapHeight');
        for (const k of ['walls', 'doors', 'plates', 'packages', 'lasers', 'guards', 'cameras', 'drones', 'winds', 'statics', 'cracks', 'robots']) {
            assert.equal(second[k].length, (setup[k] || []).length, `${k} count`);
        }
        console.log(`ok   ${i} ${level.name}`);
    } catch (err) {
        failures++;
        console.log(`FAIL ${i} ${level.name}: ${err.message}`);
    }
}
console.log(`\n${LEVELS.length - failures}/${LEVELS.length} levels round-trip`);
process.exit(failures ? 1 : 0);
