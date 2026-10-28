// Procedural floor (src/data/floorGen.js): shape, determinism, echo gate, solvable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution } from './harness/replay.mjs';
import { recordFloor, runNaiveFloor } from './harness/recordFloor.mjs';
import { generateFloor, ROOM_W, H } from '../src/data/floorGen.js';

let failures = 0;
function check(name, fn) {
    try { fn(); console.log(`  ok  ${name}`); }
    catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const SEEDS = [1, 2, 3, 7, 42, 1234];

check('floor has 1-2 seeded run pickups in walkable interiors (sand_refill|sand_max, 28x28)', () => {
    for (let s = 1; s <= 200; s++) {
        const { layout } = generateFloor(s);
        assert.ok(Array.isArray(layout.pickups) && layout.pickups.length >= 1 && layout.pickups.length <= 2);
        for (const p of layout.pickups) {
            assert.ok(p.type === 'sand_refill' || p.type === 'sand_max');
            assert.equal(p.w, 28); assert.equal(p.h, 28); assert.ok(p.id);
            assert.ok(p.x > 0 && p.x + p.w < layout.width && p.y > 20 && p.y + p.h < H - 20);
            const hit = (r) => p.x < r.x + (r.w ?? 40) && p.x + p.w > r.x && p.y < r.y + (r.h ?? 40) && p.y + p.h > r.y;
            for (const w of layout.walls) assert.ok(!hit(w), `seed ${s} pickup in wall`);
            for (const d of layout.doors) assert.ok(!hit(d), `seed ${s} pickup in door`);
            for (const pl of layout.plates) assert.ok(!hit(pl), `seed ${s} pickup on plate`);
            assert.ok(!hit(layout.deliveryZone), `seed ${s} pickup in zone`);
        }
    }
    const types = new Set(); for (let s = 1; s <= 200; s++) generateFloor(s).layout.pickups.forEach(p => types.add(p.type));
    assert.equal(types.size, 2);
});

check('same seed gives the same floor; different seeds vary', () => {
    for (const s of SEEDS) assert.deepEqual(generateFloor(s), generateFloor(s));
    const shapes = new Set(SEEDS.map(s => JSON.stringify(generateFloor(s).layout)));
    assert.ok(shapes.size > 1);
});

check('room count is 3-5 (default and clamped)', () => {
    for (let s = 1; s <= 50; s++) {
        const { info, layout } = generateFloor(s);
        assert.ok(info.roomCount >= 3 && info.roomCount <= 5);
        assert.equal(layout.width, info.roomCount * ROOM_W);
    }
    for (const n of [3, 4, 5]) assert.equal(generateFloor(9, n).info.roomCount, n);
    assert.equal(generateFloor(9, 1).info.roomCount, 3);
    assert.equal(generateFloor(9, 9).info.roomCount, 5);
});

check('schema: every door has a plate, no timers, package in room 0, zone in last room', () => {
    for (let s = 1; s <= 50; s++) {
        const { layout: L, info } = generateFloor(s);
        for (const k of ['lasers', 'guards', 'cameras', 'drones', 'winds', 'statics', 'cracks', 'robots', 'hints']) assert.deepEqual(L[k], []);
        assert.equal(L.doors.length, info.roomCount); // n-2 plain + 2 airlock
        for (const d of L.doors) {
            assert.equal(d.type, 'standard');
            assert.ok(L.plates.some(p => p.linkedIds.includes(d.id)), `door ${d.id} unlinked`);
        }
        for (const p of L.plates) assert.equal(p.type, 'standard');
        assert.ok(L.packages[0].x < ROOM_W);
        assert.ok(L.deliveryZone.x >= (info.roomCount - 1) * ROOM_W);
        const [a, b] = info.airlock.doors.map(id => L.doors.find(d => d.id === id));
        assert.equal(b.x - a.x, 20, 'airlock doors back to back');
    }
});

for (const s of [2, 7, 42]) {
    check(`seed ${s}: solo one-loop run fails at the echo room`, () => {
        assert.equal(runNaiveFloor(s).completed, false);
    });
    check(`seed ${s}: one echo is not enough`, () => {
        assert.equal(runNaiveFloor(s, undefined, 'one-echo').completed, false);
    });
    check(`seed ${s}: scripted echo solution completes within par`, () => {
        const sol = recordFloor(s);
        assert.ok(sol.completedLoops <= 3);
        const r = replaySolution(sol);
        assert.ok(r.completed, r.failMessages.join(' | '));
    });
}

check('tests/solutions/floor-seed2.json matches the generator and replays', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'solutions');
    const sol = JSON.parse(readFileSync(join(dir, 'floor-seed2.json'), 'utf8'));
    assert.equal(sol.level, null);
    const gen = generateFloor(2).layout;
    for (const k of ['width', 'height', 'deliveryZone', 'walls', 'doors']) assert.deepEqual(sol.layout[k], gen[k], k);
    assert.deepEqual(sol.layout.plates.map(p => [p.id, p.x, p.y, p.linkedIds]), gen.plates.map(p => [p.id, p.x, p.y, p.linkedIds]));
    const r = replaySolution(sol);
    assert.ok(r.completed);
    const cut = replaySolution({ ...sol, loops: sol.loops.slice(1) }, { extraTicks: 300 });
    assert.equal(cut.completed, false, 'dropping an echo loop still completed');
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
