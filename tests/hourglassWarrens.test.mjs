// Hourglass Warrens chambers, biome order, and editor JSON round-trip.
// Run: node tests/hourglassWarrens.test.mjs
// Picked up by tests/run.mjs (npm test).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { generateChamber, pickChamberTypes, CHAMBER_TYPES, CHAMBER_W, CHAMBER_H, CLEAR_KINDS, WARREN_NAME } = await import('../src/data/hourglassWarrens.js');
const { generateChamber: generateHalls } = await import('../src/data/secondHandHalls.js');
const { deserializeLevel, serializeLevel, LEVELS, copyRogueChamberMeta } = await import('../src/data/levels.js');
const { BIOME_ORDER, nextBiomeIndex, generateForBiome, editorChamberOptions, rogueChamberEditorLayout } = await import('../src/rogue/biomes.js');
const { fillRogueChamberSelect, flushEditorLevelConfig, EDITOR_SAVE_PREFIX } = await import('../src/ui/editor.js');
const { chooseAspect } = await import('../src/ui/aspectPick.js');
const { BLINK_COST } = await import('../src/systems/sandRewind.js');
const { main, state, keys } = await import('./harness/replay.mjs');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');

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
function jsonClone(v) {
    return JSON.parse(JSON.stringify(v));
}
function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
}
function quiet() {
    state.guards = [];
    state.cameras = [];
    state.lasers = [];
    state.drones = [];
}

check('chamber types cover kill, rift, and timer with guard pressure only', () => {
    assert.ok(CHAMBER_TYPES.length >= 1);
    assert.equal(CHAMBER_TYPES.length, 3);
    assert.equal(new Set(TYPES).size, TYPES.length);
    assert.deepEqual(CLEAR_KINDS, ['kill', 'rift', 'timer']);
    const clears = new Set(CHAMBER_TYPES.map(t => t.clear));
    for (const k of CLEAR_KINDS) assert.ok(clears.has(k), k);
    for (const t of CHAMBER_TYPES) {
        assert.equal(t.clear === 'kill' || t.clear === 'rift' || t.clear === 'timer', true);
        assert.deepEqual(t.pressure, ['guards']);
        assert.ok(t.name);
    }
    assert.equal(WARREN_NAME, 'Hourglass Warrens');
});

check('biome order is Second-hand Halls then Hourglass Warrens', () => {
    assert.deepEqual(BIOME_ORDER.map(b => b.id), ['second-hand-halls', 'hourglass-warrens']);
    assert.deepEqual(BIOME_ORDER.map(b => b.name), ['Second-hand Halls', WARREN_NAME]);
    assert.equal(BIOME_ORDER[0].generateChamber, generateHalls);
    assert.equal(BIOME_ORDER[1].generateChamber, generateChamber);
    assert.equal(nextBiomeIndex(0), 1);
    assert.equal(nextBiomeIndex(1), null);
    assert.deepEqual(generateForBiome('second-hand-halls', 4, 'patrol-corridor'), generateHalls(4, 'patrol-corridor'));
    assert.deepEqual(generateForBiome('hourglass-warrens', 4, 'sand-funnel'), generateChamber(4, 'sand-funnel'));
    assert.deepEqual(generateForBiome(undefined, 4), generateHalls(4));
    assert.throws(() => generateForBiome('panopticon', 1), /Unknown biome/);
    assert.equal(LEVELS.some(l => /hourglass/i.test(l.name || '')), false);
    assert.match(mainSrc, /BIOME_ORDER/);
    assert.match(mainSrc, /biome\.generateChamber\(/);
    assert.match(mainSrc, /advanceRogueBiome/);
    assert.match(mainSrc, /BLINK_COST\s*\+\s*0\.1/);
});

check('pickChamberTypes is a stable permutation and does not repeat at the seam', () => {
    for (const s of SEEDS) assert.deepEqual(pickChamberTypes(s), pickChamberTypes(s));
    const once = pickChamberTypes(5);
    assert.equal(once.length, 3);
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
    assert.notEqual(generateChamber(3, 'sand-funnel').info.type, generateChamber(3, 'crush-lane').info.type);
});

check('unknown type throws', () => {
    assert.throws(() => generateChamber(1, 'package-run'), /Unknown chamber type/);
});

check('packages empty, no plates, clear meta matches the type', () => {
    for (let s = 1; s <= 30; s++) {
        for (const spec of CHAMBER_TYPES) {
            const { layout, meta, info } = generateChamber(s, spec.id);
            assert.equal(meta.hall, WARREN_NAME);
            assert.equal(info.hall, WARREN_NAME);
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
            assert.deepEqual(layout.cameras, []);
            assert.deepEqual(layout.lasers, []);
            assert.deepEqual(info.pressure, spec.pressure);
            assert.ok(layout.guards.length >= 1, spec.id);
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

check('kill-wave guards stay at least 200px from the courier', () => {
    const killIds = CHAMBER_TYPES.filter(t => t.clear === 'kill').map(t => t.id);
    assert.ok(killIds.length >= 1);
    for (const id of killIds) {
        for (let s = 1; s <= 40; s++) {
            const { layout } = generateChamber(s, id);
            const p = layout.player;
            assert.ok(layout.guards.length >= 2);
            for (const g of layout.guards) {
                for (const pt of g.path) {
                    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                    assert.ok(d >= 200, `${id} seed ${s} (${pt.x},${pt.y}) is ${d.toFixed(1)}px from the courier`);
                }
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
            }
            if (spec.clear === 'rift') {
                const z = layout.deliveryZone;
                for (const w of layout.walls) assert.ok(!overlaps(z, w), `${spec.id} rift in wall`);
                assert.ok(!overlaps(z, player), `${spec.id} rift on courier`);
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
            assert.equal(world.cameras.length, 0);
            assert.equal(world.lasers.length, 0);
            assert.equal(world.walls.length, layout.walls.length);
            if (spec.clear === 'rift') assert.ok(world.deliveryZone.x > 0);
            else assert.ok(world.deliveryZone.x < 0);
        }
    }
});

function assertLayoutRoundTrip(layout, label) {
    state.editorLevelMeta = null;
    const world = deserializeLevel(jsonClone(layout));
    const once = jsonClone(serializeLevel(world));
    state.editorLevelMeta = null;
    const world2 = deserializeLevel(jsonClone(once));
    const twice = jsonClone(serializeLevel(world2));
    assert.deepEqual(twice, once, label);
    assert.deepEqual(once.player, layout.player, label + ' player');
    assert.deepEqual(once.walls, layout.walls, label + ' walls');
    assert.deepEqual(once.guards, layout.guards, label + ' guards');
    assert.deepEqual(once.deliveryZone, layout.deliveryZone, label + ' zone');
    assert.deepEqual(once.packages, []);
    assert.deepEqual(once.plates, []);
    assert.deepEqual(once.cameras, []);
    assert.deepEqual(once.lasers, []);
    assert.equal(once.meta.hall, layout.meta.hall, label);
    assert.equal(once.meta.biome, layout.meta.biome, label);
    assert.equal(once.meta.chamberType, layout.meta.chamberType, label);
    assert.equal(once.meta.clear, layout.meta.clear, label);
    return once;
}

check('Hourglass layouts and editor meta survive serialize/deserialize', () => {
    for (const spec of CHAMBER_TYPES) {
        for (const s of [1, 8, 21]) {
            const layout = rogueChamberEditorLayout('hourglass-warrens', spec.id, s);
            const once = assertLayoutRoundTrip(layout, `${spec.id}#${s}`);
            const key = EDITOR_SAVE_PREFIX + 'hourglass_probe';
            localStorage.setItem(key, JSON.stringify(once));
            const loaded = JSON.parse(localStorage.getItem(key));
            state.editorLevelMeta = null;
            const world = deserializeLevel(loaded);
            const again = jsonClone(serializeLevel(world));
            assert.deepEqual(again, once, `${spec.id} save/load`);
            localStorage.removeItem(key);
        }
    }
});

check('an editor-placed Hourglass guard layout round-trips, including an edit', () => {
    const placed = {
        width: CHAMBER_W, height: CHAMBER_H, mapWidth: CHAMBER_W, mapHeight: CHAMBER_H,
        player: { x: 40, y: 280 },
        deliveryZone: { x: -200, y: -200, w: 80, h: 80 },
        walls: [
            { x: 0, y: 0, w: CHAMBER_W, h: 20 },
            { x: 0, y: CHAMBER_H - 20, w: CHAMBER_W, h: 20 },
            { x: 0, y: 0, w: 20, h: CHAMBER_H },
            { x: CHAMBER_W - 20, y: 0, w: 20, h: CHAMBER_H },
            { x: 160, y: 20, w: 24, h: 160 }
        ],
        doors: [], plates: [], packages: [], hints: [],
        lasers: [], cameras: [],
        guards: [{ path: [{ x: 320, y: 180 }, { x: 700, y: 180 }] }],
        drones: [], winds: [], statics: [], cracks: [], robots: [],
        burrowers: [], gatekeepers: [], prisms: [],
        meta: {
            name: 'Editor Sand Funnel',
            story: { speaker: '', text: '' },
            obj: 'Clear the guard wave.',
            grants: ['dash', 'toss', 'cloak', 'ghostShield'],
            maxGhosts: 2,
            crackSpeed: 'normal',
            par: 1,
            hall: WARREN_NAME,
            biome: 'hourglass-warrens',
            chamberType: 'sand-funnel',
            clear: 'kill'
        }
    };
    const once = assertLayoutRoundTrip(placed, 'placed');
    // deserializeLevel replaces editorLevelMeta from the JSON. Apply the edit
    // after that load, then serialize with the edited meta (save / export path).
    const loaded = deserializeLevel(jsonClone(once));
    state.editorLevelMeta.clear = 'timer';
    state.editorLevelMeta.chamberType = 'crush-lane';
    const edited = jsonClone(serializeLevel({ ...loaded, meta: state.editorLevelMeta }));
    assert.equal(edited.meta.clear, 'timer');
    assert.equal(edited.meta.chamberType, 'crush-lane');
    assert.equal(edited.meta.hall, WARREN_NAME);
    assert.deepEqual(edited.guards, once.guards);
    state.editorLevelMeta = null;
    deserializeLevel(edited);
    assert.equal(state.editorLevelMeta.clear, 'timer');
    assert.equal(state.editorLevelMeta.chamberType, 'crush-lane');
    assert.equal(state.editorLevelMeta.biome, 'hourglass-warrens');
    const dropped = {};
    copyRogueChamberMeta({ hall: WARREN_NAME, biome: 'hourglass-warrens', clear: 'packages' }, dropped);
    assert.equal(dropped.hall, WARREN_NAME);
    assert.equal(dropped.clear, undefined);
});

check('editor lists Hourglass chambers and the config form keeps biome fields', () => {
    assert.ok(html.includes('id="editor-rogue-chamber"'));
    assert.ok(html.includes('id="editor-load-rogue-chamber"'));
    assert.ok(html.includes('id="editor-rogue-seed"'));
    assert.ok(html.includes('id="editor-meta-hall"'));
    assert.ok(html.includes('id="editor-meta-biome"'));
    assert.ok(html.includes('id="editor-meta-chamber"'));
    assert.ok(html.includes('id="editor-meta-clear"'));
    assert.ok(html.includes('value="kill"') && html.includes('value="rift"') && html.includes('value="timer"'));
    assert.ok(html.includes('value="guard"'));
    assert.ok(html.includes('id="editor-play-btn"'));
    assert.ok(html.includes('id="editor-save-btn"') && html.includes('id="editor-load-save-btn"'));
    assert.ok(html.includes('id="editor-export"') && html.includes('id="editor-import"'));

    const rows = editorChamberOptions();
    assert.equal(rows[0].biomeId, 'second-hand-halls');
    const warrens = rows.filter(r => r.biomeId === 'hourglass-warrens');
    assert.deepEqual(warrens.map(r => r.typeId), TYPES);
    assert.equal(warrens[0].label, 'Hourglass Warrens: Sand Funnel');

    const options = [];
    fillRogueChamberSelect({
        innerHTML: 'stale',
        appendChild(el) { options.push(el); }
    });
    assert.ok(options.some(o => o.value === 'hourglass-warrens|sand-funnel' && o.textContent === 'Hourglass Warrens: Sand Funnel'));
    assert.equal(options[0].value.startsWith('second-hand-halls|'), true);

    const ids = {};
    const el = (value = '', checked = false) => ({ value, checked, style: {}, innerText: '' });
    for (const [id, node] of Object.entries({
        'editor-meta-speaker': el(''),
        'editor-meta-text': el(''),
        'editor-meta-obj': el('Clear the guard wave.'),
        'editor-meta-maxghosts': el('2'),
        'editor-meta-looptime': el(''),
        'editor-meta-par': el(''),
        'editor-meta-hint': el(''),
        'editor-meta-pitfraction': el(''),
        'editor-meta-crackspeed': el('normal'),
        'editor-meta-world': el(''),
        'editor-meta-boss': el('', false),
        'editor-meta-boss-speaker': el(''),
        'editor-meta-boss-text': el(''),
        'editor-meta-boss-door': el(''),
        'editor-meta-challenge': el(''),
        'editor-meta-hall': el(WARREN_NAME),
        'editor-meta-biome': el('hourglass-warrens'),
        'editor-meta-chamber': el('sand-funnel'),
        'editor-meta-clear': el('kill'),
        'editor-meta-demo-steps': el(''),
        'editor-meta-demo-autoplay': el('', true),
        'editor-meta-demo-skippable': el('', true),
        'editor-save-status': el('')
    })) ids[id] = node;
    for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
        ids['editor-meta-' + id] = el('', false);
        ids['editor-meta-unlock-' + id] = el('', false);
    }
    const prev = document.getElementById;
    document.getElementById = (id) => ids[id] || null;
    try {
        state.editorLevelMeta = {
            name: 'Sand Funnel',
            story: { speaker: '', text: '' },
            obj: '',
            grants: [],
            maxGhosts: 2,
            crackSpeed: 'normal'
        };
        state.cracks = [];
        assert.equal(flushEditorLevelConfig(), true);
        assert.equal(state.editorLevelMeta.hall, WARREN_NAME);
        assert.equal(state.editorLevelMeta.biome, 'hourglass-warrens');
        assert.equal(state.editorLevelMeta.chamberType, 'sand-funnel');
        assert.equal(state.editorLevelMeta.clear, 'kill');
        assert.equal(state.editorLevelMeta.name, 'Sand Funnel');
        ids['editor-meta-clear'].value = 'timer';
        ids['editor-meta-chamber'].value = 'crush-lane';
        assert.equal(flushEditorLevelConfig(), true);
        assert.equal(state.editorLevelMeta.clear, 'timer');
        assert.equal(state.editorLevelMeta.chamberType, 'crush-lane');
        ids['editor-meta-clear'].value = 'packages';
        assert.equal(flushEditorLevelConfig(), true);
        assert.equal(state.editorLevelMeta.clear, undefined);
    } finally {
        document.getElementById = prev;
    }
});

check('a fresh run starts in Halls and a clear advances into Hourglass Warrens', () => {
    release();
    main.startRogueRun(1);
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.rogueRun.biomeIndex, 0);
    assert.equal(state.rogueRun.active, true);
    assert.equal(state.currentLevelMeta.hall, 'Second-hand Halls');
    assert.equal(state.currentLevelMeta.name, 'Timed Hold');
    assert.ok(state.sand.sand >= BLINK_COST + 0.1);
    const ghosts = state.currentLevelMeta.maxGhosts;
    const maxSand = state.sand.maxSand;
    quiet();
    state.rogueChamber.ticksLeft = 0;
    state.rogueChamber.aspectPending = false;
    const kicker = { textContent: '' };
    const aspectRoot = {
        classList: { add() {}, remove() {}, contains() { return false; } },
        dataset: { bound: '1' },
        querySelector(sel) { return sel === '.aspect-pick-kicker' ? kicker : null; },
        addEventListener() {}
    };
    const prevGet = document.getElementById;
    document.getElementById = (id) => (id === 'aspect-pick' ? aspectRoot : prevGet(id));
    try {
        main.stepSimulation();
        assert.equal(state.rogueChamber.aspectPending, true);
        assert.equal(kicker.textContent, 'Second-hand Halls');
        chooseAspect('echo-slot');
        assert.equal(state.rogueRun.outcome, null);
        assert.equal(state.rogueRun.active, true);
        assert.equal(state.rogueRun.biomeIndex, 1);
        assert.equal(state.gameState, 'PLAYING');
        assert.equal(state.currentLevelMeta.hall, WARREN_NAME);
        assert.equal(state.currentLevelMeta.biome, 'hourglass-warrens');
        const expected = generateForBiome('hourglass-warrens', 1);
        assert.equal(state.currentLevelMeta.name, expected.meta.name);
        assert.equal(state.currentLevelMeta.obj, expected.meta.obj);
        assert.equal(state.currentLevelMeta.clear, expected.meta.clear);
        assert.equal(state.player.x, expected.layout.player.x);
        assert.equal(state.player.y, expected.layout.player.y);
        assert.equal(state.currentLevelMeta.maxGhosts, ghosts + 1);
        assert.equal(state.sand.maxSand, maxSand);
        assert.ok(state.sand.sand >= BLINK_COST);
        assert.equal(state.sand.history.length, 0);
        for (const id of ['dash', 'toss', 'cloak', 'ghostShield']) {
            assert.ok(state.currentLevelMeta.grants.includes(id), id);
        }
        quiet();
        state.rogueChamber.aspectPending = false;
        if (state.rogueChamber.type === 'timer') state.rogueChamber.ticksLeft = 0;
        else if (state.rogueChamber.type === 'wave') state.rogueChamber.enemiesLeft = 0;
        else state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
        release();
        main.stepSimulation();
        assert.equal(state.rogueChamber.aspectPending, true);
        assert.equal(kicker.textContent, WARREN_NAME);
        chooseAspect('start-sand');
        assert.equal(state.gameState, 'RUN_OVER');
        assert.equal(state.rogueRun.outcome, 'cleared');
        assert.equal(state.rogueRun.active, false);
    } finally {
        document.getElementById = prevGet;
    }
});

await Promise.all(jobs);
if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
}
console.log('hourglassWarrens ok');
