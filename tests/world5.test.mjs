// World 5: Overclock block wiring, spec, editor round-trip, and the temporal
// plate rules each level depends on. Run: node tests/world5.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, WORLDS, getLevelSetup, serializeLevel, deserializeLevel, levelSelectEntries } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (err) { failures++; console.log(`  FAIL ${name}\n       ${err.stack || err.message}`); }
}

const w5 = LEVELS.map((level, index) => ({ level, index })).filter(({ level }) => String(level.name).startsWith('W5-'));
const SPEC = {
    'W5-L1: First Light': { par: 3, loopTime: 25, maxGhosts: 2, grants: [] },
    'W5-L2: Last Word': { par: 3, loopTime: 28, maxGhosts: 2, grants: [] },
    'W5-L3: Slow Motion': { par: 3, loopTime: 30, maxGhosts: 2, grants: [] },
    'W5-L4: Courier Overclock': { par: 4, loopTime: 45, maxGhosts: 3, grants: ['ghostShield'] },
    'W5-BOSS: XR-9': { par: 5, loopTime: 40, maxGhosts: 4, grants: [] }
};

check('world 5 is the contiguous W5 block after W4', () => {
    assert.ok(w5.length >= 2);
    const over = WORLDS.find(w => w.id === 5);
    const beam = WORLDS.find(w => w.id === 4);
    assert.deepEqual(over.levels, w5.map(({ index }) => index));
    assert.ok(over.levels[0] > beam.levels[beam.levels.length - 1]);
    assert.ok(WORLDS.indexOf(over) > WORLDS.indexOf(beam));
});

check('old Overclock placeholders are hidden but kept', () => {
    const names = levelSelectEntries().filter(e => e.type === 'level').map(e => e.lvl.name);
    for (const n of ['Level 11: Time Dilation', 'Level 12: Danger Courier', 'Level 9: Fragile Grid', 'Level 10: Fast Shipping']) {
        const lvl = LEVELS.find(l => l.name === n);
        assert.ok(lvl, n);
        assert.equal(lvl.hideFromSelect, true, n);
        assert.equal(names.includes(n), false, n);
    }
    for (const { level } of w5) assert.ok(names.includes(level.name), level.name);
});

for (const { level, index } of w5) {
    check(`spec ${level.name}`, () => {
        const spec = SPEC[level.name];
        assert.ok(spec, 'unexpected level name');
        assert.equal(level.world, 5);
        assert.equal(level.par, spec.par);
        assert.equal(level.loopTime, spec.loopTime);
        assert.equal(level.maxGhosts, spec.maxGhosts);
        assert.deepEqual(level.grants || [], spec.grants);
        assert.ok(level.story?.text);
        assert.ok(level.obj);
        assert.equal(level.isPendingCampaign, false);
    });

    check(`editor round-trip ${level.name}`, () => {
        const setup = getLevelSetup(index);
        setEditorLevelMetaFromLevel(level);
        const first = serializeLevel({ ...setup, meta: state.editorLevelMeta });
        const json = JSON.parse(JSON.stringify(first));
        state.editorLevelMeta = null;
        const loaded = deserializeLevel(json);
        const second = serializeLevel({ ...loaded, meta: state.editorLevelMeta });
        assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), json);
        assert.equal(json.meta.world, 5);
        const modes = json.plates.filter(p => p.type === 'temporal').map(p => p.requiredTimeline).sort();
        if (level.name.startsWith('W5-L1')) assert.deepEqual(modes, ['first']);
        if (level.name.startsWith('W5-L2')) assert.deepEqual(modes, ['first', 'last', 'present']);
        if (level.name.startsWith('W5-L4')) {
            assert.deepEqual(modes, ['first', 'last']);
            assert.equal(json.packages[0].packageType, 'fragile');
            assert.equal(json.lasers.length, 1);
            assert.equal(json.guards.length, 1);
            assert.ok(json.cracks.length >= 1);
            assert.ok(json.statics.length >= 1);
            assert.ok(json.doors.some(d => d.type === 'timer'));
        }
        if (level.name.startsWith('W5-BOSS')) {
            assert.deepEqual(modes, ['last']);
            assert.equal(json.robots.length, 1);
            const r = json.robots[0];
            assert.equal(r.targetEchoes, true);
            assert.equal(r.backTouch, true);
            assert.equal(r.checkpoint, true);
            assert.equal(r.hp ?? 3, 3);
            assert.equal(r.defeatDoorId ?? 'boss_door', 'boss_door');
            assert.ok(r.telegraphTime >= 1.5 && r.telegraphTime <= 2, 'telegraph is 1.5-2s');
            assert.ok(Math.abs(r.backArc - Math.PI / 3) < 1e-9);
            assert.equal(json.meta.isBoss, true);
        }
        if (level.name.startsWith('W5-L3')) {
            assert.equal(json.statics.length, 2);
            const gate = json.doors.find(d => d.id === 'gate');
            assert.equal(gate.type, 'timer');
            assert.equal(gate.openT, 240);
            assert.equal(gate.openT + gate.closedT, level.loopTime * 60, 'gate opens once per loop');
        }
    });
}

check('airlock doors leave no room to stand between them', () => {
    for (const { index } of w5.filter(({ level }) => /W5-L[123]/.test(level.name))) {
        const doors = getLevelSetup(index).doors.filter(d => d.y === 240 && d.w === 20 && d.id !== 'd_exit').sort((a, b) => a.x - b.x);
        assert.ok(doors.length >= 2);
        assert.equal(doors[0].x + doors[0].w, doors[1].x, 'outer and inner doors touch');
    }
});

check('W5-L2 exit plate stays pressed until the courier clears the door', () => {
    const idx = w5.find(({ level }) => level.name.startsWith('W5-L2')).index;
    const setup = getLevelSetup(idx);
    const plate = setup.plates.find(p => p.id === 'p_exit');
    const door = setup.doors.find(d => d.id === 'd_exit');
    const pw = 30;
    const frac = (x) => Math.max(0, Math.min(x + pw, plate.x + plate.w) - Math.max(x, plate.x)) / pw;
    assert.ok(frac(door.x - pw) >= 0.25, 'pressed while pushing on the shut door');
    assert.ok(frac(door.x + door.w) >= 0.25, 'still pressed once fully through');
});

if (failures) { console.log(`${failures} world5 check(s) failed`); process.exit(1); }
console.log('all world5 checks passed');
