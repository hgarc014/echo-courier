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
const { LEVELS, getLevelSetup, serializeLevel, deserializeLevel, normalizeLoopTime, normalizePar, installParChallenge, formatParTooltip } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel, refreshEditorLevelConfigForm } = await import('../src/ui/editor.js');

const ENTITY_KEYS = ['walls', 'doors', 'plates', 'hints', 'packages', 'lasers', 'guards', 'cameras', 'drones', 'winds', 'statics', 'cracks', 'robots', 'burrowers', 'gatekeepers'];
// Runtime-only props reset every run; anything else must survive the editor round-trip.
const IGNORE = new Set(['projectiles']);

// Snapshot an entity's own data props (functions dropped) plus its class name.
function snapEntity(e) {
    const out = { __type: e?.constructor?.name };
    for (const [k, v] of Object.entries(e || {})) {
        if (typeof v === 'function' || IGNORE.has(k)) continue;
        out[k] = v;
    }
    return JSON.parse(JSON.stringify(out));
}
function snapLayout(setup) {
    const out = { mapWidth: setup.mapWidth, mapHeight: setup.mapHeight, player: snapEntity(setup.player), deliveryZone: snapEntity(setup.deliveryZone) };
    for (const k of ENTITY_KEYS) out[k] = (setup[k] || []).map(snapEntity);
    return out;
}
const META_FIELDS = ['name', 'obj', 'maxGhosts', 'world', 'unlocks', 'grants', 'loopTime', 'par', 'isBoss', 'bossIntro', 'bossIntroDoorId'];
function expectedMeta(level) {
    return {
        name: level.name, obj: level.obj || '', maxGhosts: level.maxGhosts ?? 3,
        story: { speaker: level.story?.speaker || '', text: level.story?.text || '' },
        world: level.world, unlocks: level.unlocks, grants: level.grants || [],
        loopTime: normalizeLoopTime(level.loopTime) ?? undefined,
        par: normalizePar(level.par) ?? undefined,
        isBoss: level.isBoss || undefined, bossIntro: level.bossIntro, bossIntroDoorId: level.bossIntroDoorId
    };
}
function pickMeta(m) {
    const out = { story: m.story };
    for (const k of META_FIELDS) out[k] = m[k] ?? undefined;
    if (!out.isBoss) out.isBoss = undefined;
    return JSON.parse(JSON.stringify(out));
}

let failures = 0;
for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i];
    try {
        // Same path as "load campaign level into editor".
        const setup = getLevelSetup(i);
        const original = snapLayout(setup);
        setEditorLevelMetaFromLevel(level);
        const first = serializeLevel({ ...setup, meta: state.editorLevelMeta });
        const json = JSON.parse(JSON.stringify(first));

        state.editorLevelMeta = null; // nothing may leak from the pre-export meta
        const data = deserializeLevel(json);
        const loadedMeta = state.editorLevelMeta;

        // 1. Loaded entities match the ORIGINAL campaign entities (type, position, config).
        const loaded = snapLayout(data);
        for (const k of ['mapWidth', 'mapHeight', 'player', 'deliveryZone', ...ENTITY_KEYS]) {
            assert.deepStrictEqual(loaded[k], original[k], `entities "${k}" differ from original`);
        }
        // 2. Level config matches the original level definition.
        assert.deepStrictEqual(pickMeta(loadedMeta), JSON.parse(JSON.stringify(expectedMeta(level))), 'meta differs from original');
        // crackSpeed: top-level + meta export, editor meta, and every loaded crack.
        const speed = level.crackSpeed === 'fast' ? 'fast' : 'normal';
        assert.equal(json.crackSpeed ?? 'normal', speed, 'top-level crackSpeed');
        assert.equal(json.meta.crackSpeed ?? 'normal', speed, 'meta.crackSpeed');
        assert.equal(loadedMeta.crackSpeed ?? 'normal', speed, 'editor meta crackSpeed');
        for (const c of data.cracks) assert.equal(c.crackSpeed, speed, 'crack entity crackSpeed');
        // 3. Re-export is identical.
        const second = serializeLevel({ ...data, meta: loadedMeta });
        assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), json, 're-export not identical');
        console.log(`ok   ${i} ${level.name}`);
    } catch (err) {
        failures++;
        console.log(`FAIL ${i} ${level.name}: ${err.message.split('\n').slice(0, 12).join('\n')}`);
    }
}
try {
    assert.equal(normalizePar(''), null);
    assert.equal(normalizePar(null), null);
    assert.equal(normalizePar(0), null);
    assert.equal(normalizePar(-3), null);
    assert.equal(normalizePar(2.5), null);
    assert.equal(normalizePar('4'), 4);
    assert.equal(normalizePar(' 2 '), 2);

    const copied = setEditorLevelMetaFromLevel({ name: 'Par Probe', par: '4', obj: 'go' });
    assert.equal(copied.par, 4);
    const unset = setEditorLevelMetaFromLevel({ name: 'No Par', obj: '' });
    assert.equal(unset.par, undefined);

    const parInput = { value: 'stale' };
    const prevGet = document.getElementById;
    document.getElementById = (id) => (id === 'editor-meta-par' ? parInput : null);
    state.editorLevelMeta = setEditorLevelMetaFromLevel({ name: 'Form', par: 3, obj: '' });
    refreshEditorLevelConfigForm();
    assert.equal(parInput.value, '3');
    delete state.editorLevelMeta.par;
    refreshEditorLevelConfigForm();
    assert.equal(parInput.value, '');
    document.getElementById = prevGet;

    const setup = getLevelSetup(0);
    state.editorLevelMeta = { ...copied, story: copied.story };
    const exported = serializeLevel({ ...setup, meta: state.editorLevelMeta });
    assert.equal(exported.meta.par, 4);
    state.editorLevelMeta = null;
    deserializeLevel(JSON.parse(JSON.stringify(exported)));
    assert.equal(state.editorLevelMeta.par, 4);
    const again = serializeLevel({ ...setup, meta: state.editorLevelMeta });
    assert.equal(again.meta.par, 4);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(again.meta)), JSON.parse(JSON.stringify(exported.meta)));

    state.editorLevelMeta.par = '';
    assert.equal(serializeLevel({ ...setup, meta: state.editorLevelMeta }).meta.par, undefined);
    state.editorLevelMeta.par = 2.5;
    assert.equal(serializeLevel({ ...setup, meta: state.editorLevelMeta }).meta.par, undefined);

    const kept = { name: 'Has Challenge', par: 2, challenge: { desc: 'keep', check: () => false } };
    installParChallenge(kept);
    assert.equal(kept.challenge.desc, 'keep');

    const fresh = { name: 'Par Only', par: 2 };
    installParChallenge(fresh);
    assert.equal(fresh.challenge.desc, 'Finish in 2 loops or fewer');
    assert.equal(formatParTooltip(fresh.challenge.desc), 'Par: Finish in 2 loops or fewer');
    assert.equal(formatParTooltip('Par: Finish in 2 loops or fewer'), 'Par: Finish in 2 loops or fewer');
    assert.equal(formatParTooltip('Par: par already'), 'Par: par already');
    const prevLoop = state.loopNumber;
    state.loopNumber = 1;
    assert.equal(fresh.challenge.check(), true);
    state.loopNumber = 2;
    assert.equal(fresh.challenge.check(), true);
    state.loopNumber = 3;
    assert.equal(fresh.challenge.check(), false);
    state.loopNumber = prevLoop;

    const one = { par: 1 };
    installParChallenge(one);
    assert.equal(one.challenge.desc, 'Finish in 1 loop or fewer');
    assert.equal(formatParTooltip(one.challenge.desc), 'Par: Finish in 1 loop or fewer');
    for (const lvl of LEVELS) {
        if (!lvl.challenge?.desc) continue;
        const title = formatParTooltip(lvl.challenge.desc);
        assert.equal(/^par:\s*par\b/i.test(title), false, `${lvl.name} tooltip doubled: ${title}`);
    }
    for (const bad of [{ par: 0 }, { par: 2.5 }, { par: '' }, {}]) {
        installParChallenge(bad);
        assert.equal(bad.challenge, undefined);
    }
    console.log('ok   par field');
} catch (err) {
    failures++;
    console.log(`FAIL par field: ${err.message.split('\n').slice(0, 12).join('\n')}`);
}

console.log(`\n${LEVELS.length - failures}/${LEVELS.length} levels round-trip`);
process.exit(failures ? 1 : 0);
