// Second-hand Halls chambers + the after-chamber Aspect picker.
// Run: node tests/secondHandHalls.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { generateChamber, pickChamberTypes, CHAMBER_TYPES, CHAMBER_W, CHAMBER_H, CLEAR_KINDS, HALL_NAME } = await import('../src/data/secondHandHalls.js');
const { deserializeLevel } = await import('../src/data/levels.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'style.css'), 'utf8');

let failures = 0;
const jobs = [];
function check(name, fn) {
    jobs.push((async () => {
        try {
            await fn();
            console.log(`  ok  ${name}`);
        } catch (e) {
            failures++;
            console.log(`  FAIL ${name}\n       ${e.stack || e.message}`);
        }
    })());
}

const TYPES = CHAMBER_TYPES.map(t => t.id);
const SEEDS = [1, 2, 3, 7, 42, 99];

function rectOf(e, w, h) {
    return { x: e.x, y: e.y, w: e.w ?? w, h: e.h ?? h };
}
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function insideRoom(r) {
    return r.x >= 20 && r.y >= 20 && r.x + r.w <= CHAMBER_W - 20 && r.y + r.h <= CHAMBER_H - 20;
}

check('five chamber types cover kill, rift, and timer', () => {
    assert.ok(CHAMBER_TYPES.length >= 4 && CHAMBER_TYPES.length <= 5);
    assert.equal(CHAMBER_TYPES.length, 5);
    assert.equal(new Set(TYPES).size, TYPES.length);
    const clears = new Set(CHAMBER_TYPES.map(t => t.clear));
    for (const k of CLEAR_KINDS) assert.ok(clears.has(k), k);
    for (const t of CHAMBER_TYPES) {
        assert.equal(t.clear === 'kill' || t.clear === 'rift' || t.clear === 'timer', true);
        assert.ok(t.name && t.pressure.length >= 1);
    }
});

check('pickChamberTypes is a stable permutation and does not repeat at the seam', () => {
    for (const s of SEEDS) assert.deepEqual(pickChamberTypes(s), pickChamberTypes(s));
    const once = pickChamberTypes(5);
    assert.equal(once.length, 5);
    assert.deepEqual([...once].sort(), [...TYPES].sort());
    const orders = new Set();
    for (let s = 1; s <= 40; s++) orders.add(pickChamberTypes(s).join(','));
    assert.ok(orders.size > 1);
    const long = pickChamberTypes(5, 12);
    assert.equal(long.length, 12);
    for (let i = 1; i < long.length; i++) assert.notEqual(long[i], long[i - 1]);
    assert.equal(generateChamber(5).info.type, pickChamberTypes(5, 1)[0]);
});

check('same seed is stable; layouts vary across seeds', () => {
    for (const s of SEEDS) {
        assert.deepEqual(generateChamber(s), generateChamber(s));
        for (const id of TYPES) assert.deepEqual(generateChamber(s, id), generateChamber(s, id));
    }
    for (const id of TYPES) {
        const shapes = new Set();
        for (let s = 1; s <= 40; s++) shapes.add(JSON.stringify(generateChamber(s, id).layout));
        assert.ok(shapes.size > 1, id);
    }
    assert.notEqual(generateChamber(3, 'sweep-yard').info.type, generateChamber(3, 'patrol-corridor').info.type);
});

check('unknown type throws', () => {
    assert.throws(() => generateChamber(1, 'package-run'), /Unknown chamber type/);
});

check('packages empty, no plates, clear meta matches the type', () => {
    for (let s = 1; s <= 30; s++) {
        for (const spec of CHAMBER_TYPES) {
            const { layout, meta, info } = generateChamber(s, spec.id);
            assert.equal(meta.hall, HALL_NAME);
            assert.equal(info.hall, HALL_NAME);
            assert.equal(meta.name, spec.name);
            assert.equal(meta.type, spec.id);
            assert.equal(meta.clear, spec.clear);
            assert.equal(info.clear, spec.clear);
            assert.equal(info.type, spec.id);
            assert.equal(info.waveCount, meta.waveCount);
            assert.equal(info.clearSeconds, meta.clearSeconds);
            assert.equal(meta.loopTime, null);
            assert.ok(meta.obj && !/package|plate/i.test(meta.obj));
            assert.deepEqual(layout.packages, []);
            assert.deepEqual(layout.plates, []);
            assert.deepEqual(layout.doors, []);
            for (const p of layout.packages) assert.equal(p.requiredForDelivery, false);
            assert.deepEqual(info.pressure, spec.pressure);
            for (const kind of spec.pressure) assert.ok(layout[kind].length >= 1, `${spec.id} ${kind}`);
            if (spec.clear === 'kill') {
                assert.ok(meta.waveCount >= 2);
                assert.equal(meta.waveCount, layout.guards.length);
                assert.equal(meta.clearSeconds, null);
            } else {
                assert.equal(meta.waveCount, 0);
            }
            if (spec.clear === 'timer') {
                assert.ok(meta.clearSeconds === 8 || meta.clearSeconds === 10 || meta.clearSeconds === 12);
                assert.match(meta.obj, new RegExp(String(meta.clearSeconds)));
            } else {
                assert.equal(meta.clearSeconds, null);
            }
            const z = layout.deliveryZone;
            if (spec.clear === 'rift') {
                assert.ok(insideRoom(z), `${spec.id} rift off-room`);
            } else {
                assert.ok(z.x < 0 && z.y < 0, `${spec.id} zone still on the map`);
            }
        }
    }
});

check('patrol corridor keeps every guard path point at least 200px from the courier', () => {
    for (let s = 1; s <= 40; s++) {
        const { layout } = generateChamber(s, 'patrol-corridor');
        const p = layout.player;
        assert.ok(layout.guards.length >= 2);
        for (const g of layout.guards) {
            for (const pt of g.path) {
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                assert.ok(d >= 200, `seed ${s} (${pt.x},${pt.y}) is ${d.toFixed(1)}px from the courier`);
            }
        }
    }
});

check('rift dash keeps every guard path point at least 200px from the courier', () => {
    for (let s = 1; s <= 40; s++) {
        const { layout, info } = generateChamber(s, 'rift-dash');
        const p = layout.player;
        assert.equal(info.clear, 'rift');
        assert.ok(layout.guards.length >= 1);
        assert.equal(layout.lasers.length >= 1, true);
        assert.deepEqual(layout.packages, []);
        assert.deepEqual(layout.plates, []);
        for (const g of layout.guards) {
            for (const pt of g.path) {
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                assert.ok(d >= 200, `seed ${s} (${pt.x},${pt.y}) is ${d.toFixed(1)}px from the courier`);
            }
        }
    }
});

check('bodies stay off walls and off the courier; rift chambers keep the zone clear', () => {
    const body = 30;
    for (let s = 1; s <= 25; s++) {
        for (const spec of CHAMBER_TYPES) {
            const { layout } = generateChamber(s, spec.id);
            const player = rectOf(layout.player, body, body);
            assert.ok(insideRoom(player), spec.id);
            const solids = [];
            for (const g of layout.guards) {
                assert.ok(g.path.length >= 2);
                assert.notDeepEqual(g.path[0], g.path[1]);
                for (const pt of g.path) solids.push(rectOf(pt, body, body));
            }
            for (const c of layout.cameras) solids.push(rectOf(c, body, body));
            for (const r of solids) {
                assert.ok(insideRoom(r), `${spec.id} body out of room`);
                for (const w of layout.walls) assert.ok(!overlaps(r, w), `${spec.id} body in wall`);
                assert.ok(!overlaps(r, player), `${spec.id} body on courier`);
            }
            for (const laser of layout.lasers) {
                const beam = rectOf(laser, laser.w, laser.h);
                assert.ok(beam.x >= 20 && beam.y >= 20 && beam.x + beam.w <= CHAMBER_W - 20 && beam.y + beam.h <= CHAMBER_H - 20);
                assert.ok(!overlaps(beam, player), `${spec.id} laser on courier`);
                assert.ok(laser.id);
            }
            if (spec.clear === 'rift') {
                const z = layout.deliveryZone;
                for (const w of layout.walls) assert.ok(!overlaps(z, w), `${spec.id} rift in wall`);
                assert.ok(!overlaps(z, player), `${spec.id} rift on courier`);
                for (const laser of layout.lasers) assert.ok(!overlaps(z, laser), `${spec.id} rift in laser`);
            }
        }
    }
});

check('deserializeLevel accepts every chamber and loads no required package', () => {
    for (const s of [1, 8, 21]) {
        for (const spec of CHAMBER_TYPES) {
            const { layout } = generateChamber(s, spec.id);
            const world = deserializeLevel(layout);
            assert.equal(world.packages.length, 0);
            assert.equal(world.plates.length, 0);
            assert.equal(world.doors.length, 0);
            assert.equal(world.guards.length, layout.guards.length);
            assert.equal(world.cameras.length, layout.cameras.length);
            assert.equal(world.lasers.length, layout.lasers.length);
            assert.equal(world.walls.length, layout.walls.length);
            for (const p of world.packages) assert.notEqual(p.requiredForDelivery, true);
            if (spec.clear === 'rift') assert.ok(world.deliveryZone.x > 0);
            else assert.ok(world.deliveryZone.x < 0);
        }
    }
});

check('aspect panel markup has three boon buttons', () => {
    assert.ok(html.includes('id="aspect-pick"'));
    assert.ok(html.includes('aspect-pick hidden') || html.includes('hidden overlay panel aspect-pick') || /id="aspect-pick"[^>]*hidden/.test(html));
    for (const id of ['sand-tank', 'start-sand', 'echo-slot']) {
        assert.ok(html.includes(`data-aspect="${id}"`), id);
    }
    assert.ok(html.includes('+Sand Tank') && html.includes('+Start Sand') && html.includes('+Echo Slot'));
    assert.ok(css.includes('#aspect-pick') && css.includes('.aspect-card'));
    assert.ok(html.includes('class="aspect-pick-kicker"'));
    const aspectSrc = readFileSync(join(root, 'src/ui/aspectPick.js'), 'utf8');
    assert.match(aspectSrc, /querySelector\('\.aspect-pick-kicker'\)/);
    assert.match(aspectSrc, /kick\.textContent = label/);
    const entry = html.match(/<script\s+type="module"\s+src="([^"]+)"/);
    assert.equal(entry[1], 'src/main.js');
    assert.ok(html.includes('src/ui/aspectPick.js'));
});

function makeAspectRoot() {
    let hidden = true;
    const listeners = {};
    const kicker = { textContent: 'Second-hand Halls' };
    return {
        classList: {
            add(c) { if (c === 'hidden') hidden = true; },
            remove(c) { if (c === 'hidden') hidden = false; },
            contains(c) { return c === 'hidden' && hidden; }
        },
        dataset: {},
        querySelector(sel) { return sel === '.aspect-pick-kicker' ? kicker : null; },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        listeners,
        kicker,
        isHidden() { return hidden; }
    };
}

check('showAspectPick / hideAspectPick and a button call onPick(id) once', async () => {
    const aspectRoot = makeAspectRoot();
    document.getElementById = (id) => (id === 'aspect-pick' ? aspectRoot : null);
    const { showAspectPick, hideAspectPick, ASPECTS } = await import('../src/ui/aspectPick.js');
    assert.deepEqual(ASPECTS.map(a => a.id), ['sand-tank', 'start-sand', 'echo-slot']);
    assert.equal(typeof showAspectPick, 'function');
    assert.equal(globalThis.showAspectPick, showAspectPick);
    assert.equal(globalThis.hideAspectPick, hideAspectPick);
    const picked = [];
    assert.equal(aspectRoot.kicker.textContent, 'Second-hand Halls');
    showAspectPick((id) => picked.push(id));
    assert.equal(aspectRoot.kicker.textContent, 'Second-hand Halls');
    assert.equal(aspectRoot.isHidden(), false);
    const btn = {
        getAttribute: (k) => (k === 'data-aspect' ? 'echo-slot' : null),
        closest: (sel) => (sel === '[data-aspect]' ? btn : null)
    };
    aspectRoot.listeners.click[0]({ target: btn });
    assert.deepEqual(picked, ['echo-slot']);
    assert.equal(aspectRoot.isHidden(), true);
    aspectRoot.listeners.click[0]({ target: btn });
    assert.deepEqual(picked, ['echo-slot']);
    showAspectPick((id) => picked.push(id), 'Hourglass Warrens');
    assert.equal(aspectRoot.kicker.textContent, 'Hourglass Warrens');
    showAspectPick((id) => picked.push(id), '   ');
    assert.equal(aspectRoot.kicker.textContent, 'Hourglass Warrens');
    hideAspectPick();
    assert.equal(aspectRoot.isHidden(), true);
    aspectRoot.listeners.click[0]({ target: { ...btn, getAttribute: () => 'sand-tank', closest: btn.closest } });
    assert.deepEqual(picked, ['echo-slot']);
    showAspectPick((id) => picked.push(id), 'Second-hand Halls');
    assert.equal(aspectRoot.kicker.textContent, 'Second-hand Halls');
    hideAspectPick();
});

await Promise.all(jobs);
if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
