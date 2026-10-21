// World 4: editor round-trip of the Beamworks levels, and Prism unit behavior.
// Run: node tests/world4.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { LEVELS, WORLDS, getLevelSetup, serializeLevel, deserializeLevel, formatParTooltip } = await import('../src/data/levels.js');
const { setEditorLevelMetaFromLevel } = await import('../src/ui/editor.js');
const { applyPrismConfig } = await import('../src/ui/editorInspector.js');
const { Prism, PRISM_DEFAULTS, normalizePrismParams, angleDiff, blockerRayDistance } = await import('../src/entities/bosses/Prism.js');
const { Door, Package } = await import('../src/entities/interactables.js');
const { shieldSlab, laserThreatens, dominantFacing } = await import('../src/systems/laserShield.js');

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
    state.walls = [];
    state.player = null;
    state.activeGhosts = [];
}

const w4 = LEVELS.map((level, index) => ({ level, index })).filter(({ level }) => String(level.name).startsWith('W4-'));
assert.equal(w4.length, 5, 'expected five W4 levels');

const beam = WORLDS.find(w => w.id === 4);
assert.ok(beam, 'world 4 exists');
assert.deepEqual(beam.levels, w4.map(({ index }) => index), 'world 4 levels are the contiguous W4 block');
assert.ok(beam.levels.every((idx, i) => i === 0 || idx === beam.levels[i - 1] + 1), 'W4 indices are contiguous');
assert.ok(beam.levels[0] > 11, 'W4 block is appended after the legacy campaign');

const SPEC = {
    'W4-L1: Glass': { par: 2, loopTime: 22, maxGhosts: 1, grants: [] },
    'W4-L2: Two Beams, One Ghost': { par: 2, loopTime: 26, maxGhosts: 1, grants: [] },
    'W4-L3: Shieldwall': { par: 2, loopTime: 24, maxGhosts: 1, grants: ['ghostShield'] },
    'W4-L4: Prism Freight': { par: 3, loopTime: 36, maxGhosts: 2, grants: ['ghostShield'] },
    'W4-MB: Prism': { par: 3, loopTime: 30, maxGhosts: 2, grants: ['ghostShield'] }
};

for (const { level, index } of w4) {
    check(`spec ${level.name}`, () => {
        const spec = SPEC[level.name];
        assert.ok(spec, 'unexpected level name');
        assert.equal(level.world, 4);
        assert.equal(level.par, spec.par);
        assert.equal(level.loopTime, spec.loopTime);
        assert.equal(level.maxGhosts, spec.maxGhosts);
        assert.deepEqual(level.grants || [], spec.grants);
        assert.equal(level.hints?.length || 0, 0);
        assert.ok(level.story?.text);
        assert.ok(level.obj);
        assert.equal(level.isPendingCampaign, true);
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
        assert.equal(json.meta.world, 4);
        assert.deepEqual(json.meta.grants, level.grants || []);
        assert.equal(json.meta.loopTime, level.loopTime);
        assert.equal(json.meta.maxGhosts, level.maxGhosts);
        assert.deepEqual(json.hints, []);
        if (level.name.startsWith('W4-L1')) {
            assert.equal(json.packages[0].packageType, 'fragile');
            assert.equal(json.packages[0].requiredForDelivery, true);
            assert.equal(json.lasers.length, 1);
        }
        if (level.name.startsWith('W4-L4')) {
            assert.equal(json.crackSpeed, 'fast');
            assert.ok(json.cracks.length >= 1);
            assert.ok(json.cameras.length >= 1);
            assert.ok(json.doors.some(d => d.type === 'timer'));
        }
        if (level.name.startsWith('W4-MB')) {
            assert.equal(json.meta.isBoss, true);
            assert.equal(json.prisms.length, 1);
            const boss = json.prisms[0];
            assert.equal(boss.hp, 3);
            assert.equal(boss.sweepSpeed, PRISM_DEFAULTS.sweepSpeed);
            assert.equal(boss.arc, PRISM_DEFAULTS.arc);
            assert.equal(boss.range, 240);
            assert.equal(boss.receiverArc, PRISM_DEFAULTS.receiverArc);
            assert.equal(boss.telegraphTime, 1.5);
            assert.equal(boss.defeatDoorId, 'boss_door');
            assert.equal(loaded.prisms[0].maxHp, 3);
            assert.equal(loaded.prisms[0].hp, 3);
        } else {
            assert.deepEqual(json.prisms, []);
        }
    });
}

check('inspector prism config survives JSON', () => {
    resetWorld();
    const idx = LEVELS.findIndex(l => l.name.startsWith('W4-MB'));
    const setup = getLevelSetup(idx);
    applyPrismConfig(setup.prisms[0], {
        hp: 4,
        range: 280,
        sweepSpeed: 0.4,
        telegraphTime: 1,
        receiverRange: 90,
        defeatDoorId: 'boss_door'
    });
    setEditorLevelMetaFromLevel(LEVELS[idx]);
    const json = JSON.parse(JSON.stringify(serializeLevel({ ...setup, meta: state.editorLevelMeta })));
    const back = deserializeLevel(json);
    assert.equal(back.prisms[0].maxHp, 4);
    assert.equal(back.prisms[0].range, 280);
    assert.equal(back.prisms[0].sweepSpeed, 0.4);
    assert.equal(back.prisms[0].telegraphTime, 1);
    assert.equal(back.prisms[0].receiverRange, 90);
    const again = JSON.parse(JSON.stringify(serializeLevel({ ...back, meta: state.editorLevelMeta })));
    assert.deepEqual(again.prisms, json.prisms);
});

check('param normalization', () => {
    const n = normalizePrismParams({ sweepSpeed: 0, arc: -1, hp: 2.5, telegraphTime: 0, range: 'nope', spin: 0, receiverArc: -2 });
    assert.equal(n.sweepSpeed, PRISM_DEFAULTS.sweepSpeed);
    assert.equal(n.arc, PRISM_DEFAULTS.arc);
    assert.equal(n.hp, 3);
    assert.equal(n.telegraphTime, PRISM_DEFAULTS.telegraphTime);
    assert.equal(n.range, PRISM_DEFAULTS.range);
    assert.equal(n.spin, 1);
    assert.equal(n.receiverArc, PRISM_DEFAULTS.receiverArc);
    const text = normalizePrismParams({ sweepSpeed: 'nope', hp: '4' });
    assert.equal(text.sweepSpeed, PRISM_DEFAULTS.sweepSpeed);
    assert.equal(text.hp, 4);
});

check('beam sweeps 90 degrees in 3 seconds and telegraphs ahead', () => {
    resetWorld();
    const prism = new Prism(0, 0, {});
    const a0 = prism.beamAngle(0);
    const a1 = prism.beamAngle(180);
    assert.ok(Math.abs(angleDiff(a1, a0) - Math.PI / 2) < 1e-6, `sweep ${a1 - a0}`);
    assert.equal(prism.beamCoversAngle(prism.beamAngle(0), 0), true);
    const ahead = prism.startAngle + prism.sweepSpeed * 0.4;
    assert.equal(prism.telegraphCoversAngle(ahead, 0), true);
    assert.equal(prism.beamCoversAngle(ahead, 0), false);
    assert.ok(prism.telegraphTime >= 1.5 && prism.telegraphTime <= 2, `warning ${prism.telegraphTime}s`);
    const lead = prism.arc / 2;
    const warned = prism.beamAngle(0) + lead + prism.sweepSpeed * 1.2;
    const late = prism.beamAngle(0) + lead + prism.sweepSpeed * 1.6;
    assert.equal(prism.telegraphCoversAngle(warned, 0), true);
    assert.equal(prism.telegraphCoversAngle(late, 0), false);
});

check('shield slab and wall block the beam', () => {
    resetWorld();
    state.currentTick = 0;
    const prism = new Prism(100, 100, { range: 400, arc: Math.PI / 6 });
    const player = { x: 220, y: 109, w: 30, h: 30, cloakTimer: 0 };
    const echo = { x: 170, y: 109, w: 30, h: 30, facingX: -1, facingY: 0, isActive: true };
    const slab = shieldSlab(echo);
    assert.ok(slab);
    assert.equal(prism.update({ player, packages: [], walls: [], slabs: [slab] }), null);
    assert.equal(prism.hp, 3);
    const burned = prism.update({ player, packages: [], walls: [], slabs: [] });
    assert.equal(burned, 'Burned by Prism Beam!');
    const wall = { x: 150, y: 90, w: 20, h: 80 };
    const blocked = new Prism(100, 100, { range: 400, arc: Math.PI / 6 });
    assert.equal(blocked.update({ player, packages: [], walls: [wall], slabs: [] }), null);
});

check('fragile on the back receiver costs 1 HP and does not fail the level', () => {
    resetWorld();
    state.currentTick = 0;
    const prism = new Prism(200, 200, { id: 'prism', range: 400, receiverRange: 90, receiverArc: Math.PI / 2 });
    const originX = 200 + prism.w / 2;
    const pkg = new Package('ammo', originX - 90, 200 + prism.h / 2 - 15, 'fragile', false);
    const door = new Door('boss_door', 0, 0, 20, 40);
    state.doors = [door];
    state.bossCheckpoint = {};
    const fail = prism.update({ player: null, packages: [pkg], walls: [], slabs: [] });
    assert.equal(fail, null);
    assert.equal(pkg.isDestroyed, true);
    assert.equal(prism.hp, 2);
    assert.equal(state.bossCheckpoint.prism.hp, 2);
    assert.equal(door.isOpen, false);
    prism.hp = 1;
    const pkg2 = new Package('ammo2', originX - 90, 200 + prism.h / 2 - 15, 'fragile', false);
    assert.equal(prism.update({ player: null, packages: [pkg2], walls: [], slabs: [] }), null);
    assert.equal(prism.hp, 0);
    assert.equal(prism.defeated, true);
    assert.equal(door.isOpen, true);
    state.bossCheckpointLive = true;
    const restored = new Prism(200, 200, { id: 'prism', hp: 3 });
    assert.equal(restored.hp, 0);
    assert.equal(restored.defeated, true);
});

check('a shielded echo opens a gap in a grid laser; diagonal facing does not', () => {
    const laser = { x: 100, y: 0, w: 20, h: 400, isOpen: false };
    const below = { x: 96, y: 250, w: 30, h: 30 };
    const above = { x: 96, y: 20, w: 30, h: 30 };
    assert.equal(laserThreatens(laser, below, []), true);
    const echo = { x: 94, y: 120, w: 30, h: 30, facingX: 0, facingY: -1 };
    const slab = shieldSlab(echo);
    assert.equal(laserThreatens(laser, below, [slab]), false);
    assert.equal(laserThreatens(laser, above, [slab]), true);
    assert.equal(dominantFacing(1, -1), null);
    assert.equal(shieldSlab({ x: 94, y: 120, w: 30, h: 30, facingX: 1, facingY: -1 }), null);
});

check('prism render does not throw on a stub context', () => {
    resetWorld();
    const prism = new Prism(10, 10, {});
    const ctx = {
        save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
        closePath() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}
    };
    prism.render(ctx);
    prism.defeated = true;
    prism.render(ctx);
});

check('telegraph and beam stop at the first wall', () => {
    const origin = { x: 124, y: 124 };
    assert.equal(blockerRayDistance(origin.x, origin.y, 0, 400, []), 400);
    const wall = { x: 180, y: 0, w: 20, h: 400 };
    const hit = blockerRayDistance(origin.x, origin.y, 0, 400, [wall]);
    assert.ok(Math.abs(hit - (180 - origin.x)) < 1e-6, `ray entered the wall (${hit})`);
    const behind = { x: 40, y: 0, w: 20, h: 400 };
    assert.equal(blockerRayDistance(origin.x, origin.y, 0, 400, [behind]), 400);
    const gap = { x: 180, y: 0, w: 20, h: 40 };
    assert.equal(blockerRayDistance(origin.x, origin.y, 0, 400, [gap]), 400);

    resetWorld();
    state.currentTick = 0;
    state.walls = [wall];
    const prism = new Prism(100, 100, { range: 400, arc: Math.PI / 6, telegraphTime: 0.75 });
    const pts = [];
    const ctx = {
        save() {}, restore() {}, beginPath() {}, moveTo() {}, arc() {},
        lineTo(x, y) { pts.push([x, y]); },
        closePath() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {}
    };
    prism.render(ctx);
    assert.ok(pts.length > 4, 'expected a traced telegraph');
    for (const [x, y] of pts) {
        assert.ok(x <= wall.x + 1e-4, `telegraph drew through the wall at ${x},${y}`);
    }
    state.walls = [];
    const openPts = [];
    prism.render({ ...ctx, lineTo(x, y) { openPts.push([x, y]); } });
    assert.ok(openPts.some(([x]) => x > 400), 'open beam should reach its range');
});

check('level tooltips use challenge.desc without a second Par prefix', () => {
    assert.equal(formatParTooltip('Finish in 2 loops or fewer'), 'Par: Finish in 2 loops or fewer');
    assert.equal(formatParTooltip('Par: Finish in 2 loops or fewer'), 'Par: Finish in 2 loops or fewer');
    assert.equal(formatParTooltip('Par: par already'), 'Par: par already');
    for (const lvl of LEVELS) {
        if (!lvl.challenge?.desc) continue;
        const title = formatParTooltip(lvl.challenge.desc);
        assert.equal(/^par:\s*par\b/i.test(title), false, `${lvl.name} tooltip doubled: ${title}`);
    }
    for (const { level } of w4) {
        const title = formatParTooltip(level.challenge.desc);
        assert.match(title, /^Par: Finish in \d+ loops? or fewer$/);
        assert.equal(title.includes(level.challenge.desc), true);
    }
});

console.log(failures ? `\n${failures} failed` : '\nall world4 checks passed');
process.exit(failures ? 1 : 0);
