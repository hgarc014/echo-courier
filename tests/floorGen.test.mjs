// Procedural floor (src/data/floorGen.js): shape, determinism, echo gate, solvable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaySolution } from './harness/replay.mjs';
import { recordFloor, runNaiveFloor } from './harness/recordFloor.mjs';
import { generateFloor, ROOM_W, H, GAP_Y, GAP_H } from '../src/data/floorGen.js';

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

check('floor has 1-2 guards with patrol points in walkable interiors', () => {
    const counts = new Set();
    const GUARD = 30; // Guard ctor footprint
    for (let s = 1; s <= 200; s++) {
        const { layout } = generateFloor(s);
        const gs = layout.guards;
        assert.ok(Array.isArray(gs) && gs.length >= 1 && gs.length <= 2, `seed ${s} count`);
        counts.add(gs.length);
        const rooms = [];
        for (const g of gs) {
            assert.ok(Array.isArray(g.points) && g.points.length >= 2, `seed ${s} points`);
            assert.notDeepEqual(g.points[0], g.points[1]);
            const room = Math.floor(g.points[0].x / ROOM_W);
            rooms.push(room);
            for (const pt of g.points) {
                assert.equal(Math.floor(pt.x / ROOM_W), room, `seed ${s} patrol leaves its room`);
                assert.ok(pt.x >= 20 && pt.y >= 20 && pt.x + GUARD <= layout.width - 20 && pt.y + GUARD <= H - 20, `seed ${s} out of bounds`);
                const body = { x: pt.x, y: pt.y, w: GUARD, h: GUARD };
                const hit = (r) => body.x < r.x + (r.w ?? 40) && body.x + body.w > r.x && body.y < r.y + (r.h ?? 40) && body.y + body.h > r.y;
                for (const w of layout.walls) assert.ok(!hit(w), `seed ${s} guard in wall`);
                for (const pl of layout.plates) assert.ok(!hit(pl), `seed ${s} guard on plate`);
                assert.ok(!hit(layout.deliveryZone), `seed ${s} guard in zone`);
                const lane = { x: room * ROOM_W, y: GAP_Y, w: ROOM_W, h: GAP_H };
                assert.ok(!hit(lane), `seed ${s} guard in doorway lane`);
            }
        }
        if (gs.length === 2) assert.notEqual(rooms[0], rooms[1], `seed ${s} both guards in one room`);
    }
    assert.equal(counts.size, 2);
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

check('floor has 1-2 sweep cameras with a finite ceiling pose', () => {
    for (let s = 1; s <= 200; s++) {
        const { layout, info } = generateFloor(s);
        const cs = layout.cameras;
        assert.ok(Array.isArray(cs) && cs.length >= 1 && cs.length <= 2, `seed ${s} count`);
        const rooms = [];
        for (const c of cs) {
            assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.baseAngle) && Number.isFinite(c.sweepRange), `seed ${s} pose`);
            assert.equal(c.y, 40);
            assert.equal(c.baseAngle, Math.PI / 2);
            assert.ok(c.sweepRange >= Math.PI / 4 && c.sweepRange <= Math.PI / 3, `seed ${s} sweep ${c.sweepRange}`);
            const room = Math.floor(c.x / ROOM_W);
            rooms.push(room);
            assert.ok(room < info.roomCount - 1, `seed ${s} camera in exit room`);
        }
        if (cs.length === 2) assert.notEqual(rooms[0], rooms[1], `seed ${s} both cameras in one room`);
    }
});

check('schema: every door has a plate, no timers, no packages, exit zone in last room', () => {
    for (let s = 1; s <= 50; s++) {
        const { layout: L, info } = generateFloor(s);
        for (const k of ['lasers', 'drones', 'winds', 'statics', 'cracks', 'robots', 'hints']) assert.deepEqual(L[k], []);
        assert.ok(L.cameras.length >= 1 && L.cameras.length <= 2, `seed ${s} cameras`);
        for (const c of L.cameras) {
            assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.baseAngle) && Number.isFinite(c.sweepRange));
            assert.ok(c.sweepRange >= Math.PI / 4 && c.sweepRange <= Math.PI / 3);
        }
        assert.equal(L.doors.length, info.roomCount); // n-2 plain + 2 airlock
        for (const d of L.doors) {
            assert.equal(d.type, 'standard');
            assert.ok(L.plates.some(p => p.linkedIds.includes(d.id)), `door ${d.id} unlinked`);
        }
        for (const p of L.plates) assert.equal(p.type, 'standard');
        assert.equal(L.packages.length, 0);
        assert.ok(L.deliveryZone);
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
    for (const k of ['width', 'height', 'deliveryZone', 'walls', 'doors', 'packages']) assert.deepEqual(sol.layout[k], gen[k], k);
    assert.deepEqual(sol.layout.plates.map(p => [p.id, p.x, p.y, p.linkedIds]), gen.plates.map(p => [p.id, p.x, p.y, p.linkedIds]));
    const r = replaySolution(sol);
    assert.ok(r.completed);
    const cut = replaySolution({ ...sol, loops: sol.loops.slice(1) }, { extraTicks: 300 });
    assert.equal(cut.completed, false, 'dropping an echo loop still completed');
});

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
