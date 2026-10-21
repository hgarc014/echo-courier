// Fragile cargo shatters in a pit or a broken crack. Other cargo is lost and the
// run fails through the same hold-then-reset path as a courier fall.
// Run: node tests/fragileCargo.test.mjs
import assert from 'node:assert/strict';
import { installDomStubs } from './harness/domStub.mjs';

installDomStubs();

const { state } = await import('../src/core/state.js');
const { Pit, CrackedFloor } = await import('../src/entities/hazards.js');
const { Package } = await import('../src/entities/interactables.js');
const { LEVELS } = await import('../src/data/levels.js');
const { loadLevel, main } = await import('./harness/replay.mjs');

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

function box(x, y) {
    return { x, y, w: 30, h: 30, assetName: 'player' };
}

function cargo(type, x, y, carriedBy = null) {
    const pkg = new Package('pkg', x, y, type, true);
    pkg.carriedBy = carriedBy;
    return pkg;
}

function brokenCrack(x, y) {
    const crack = new CrackedFloor(x, y, 40, 40, 'fast');
    crack.broken = true;
    return crack;
}

function resetActors() {
    state.player = null;
    state.activeGhosts = [];
    state.packages = [];
    state.cracks = [];
}

check('dropped fragile shatters on a broken crack and a pit', () => {
    resetActors();
    const crack = brokenCrack(100, 100);
    const fragile = cargo('fragile', 100, 100);
    state.packages = [fragile];
    assert.equal(crack.update([]), 'Fragile Package Destroyed!');
    assert.equal(fragile.isDestroyed, true);
    assert.ok(fragile.breakFx, 'fragile crack fall should shatter');

    const pit = new Pit(300, 100, 40, 40);
    const again = cargo('fragile', 300, 100);
    state.packages = [again];
    assert.equal(pit.update([]), 'Fragile Package Destroyed!');
    assert.equal(again.isDestroyed, true);
    assert.ok(again.breakFx);
});

check('dropped normal package is lost, not shattered', () => {
    resetActors();
    const crack = brokenCrack(100, 100);
    const pkg = cargo('standard', 104, 104);
    state.packages = [pkg];
    assert.equal(crack.update([]), 'Package lost!');
    assert.equal(pkg.isDestroyed, true);
    assert.equal(pkg.breakFx, null);

    const pit = new Pit(200, 100, 40, 40);
    const heavy = cargo('heavy', 200, 100);
    state.packages = [heavy];
    assert.equal(pit.update([]), 'Package lost!');
    assert.equal(heavy.isDestroyed, true);
    assert.equal(heavy.breakFx, null);
});

check('carried fragile shatters when the carrier is over a pit or broken crack', () => {
    resetActors();
    const player = box(100, 100);
    state.player = player;
    const crack = brokenCrack(100, 100);
    const fragile = cargo('fragile', 400, 400, 'player');
    state.packages = [fragile];
    const fail = crack.update([player]);
    assert.equal(fail, 'Fragile Package Destroyed!');
    assert.equal(fragile.isDestroyed, true);
    assert.ok(fragile.breakFx, 'carried fragile should shatter with the courier');

    const ghost = { id: 2, x: 300, y: 100, w: 30, h: 30, isActive: true };
    state.activeGhosts = [ghost];
    state.player = box(0, 0);
    const pit = new Pit(300, 100, 40, 40);
    const carried = cargo('fragile', 10, 10, 'ghost_2');
    state.packages = [carried];
    assert.equal(pit.update([ghost]), 'Fragile Package Destroyed!');
    assert.equal(carried.isDestroyed, true);
    assert.ok(carried.breakFx);
});

check('player carrying fragile onto a broken crack reports fragile destruction', () => {
    resetActors();
    const player = box(80, 80);
    state.player = player;
    const crack = brokenCrack(80, 80);
    const fragile = cargo('fragile', 500, 500, 'player');
    state.packages = [fragile];
    assert.equal(crack.update([player]), 'Fragile Package Destroyed!');
    assert.equal(fragile.isDestroyed, true);
    assert.ok(fragile.breakFx, 'carried fragile should shatter on the broken crack');

    const bare = box(80, 80);
    state.player = bare;
    state.packages = [];
    assert.equal(brokenCrack(80, 80).update([bare]), 'Fell into pit!');

    const again = box(80, 80);
    state.player = again;
    const plain = cargo('standard', 500, 500, 'player');
    state.packages = [plain];
    assert.equal(brokenCrack(80, 80).update([again]), 'Fell into pit!');
    assert.equal(plain.isDestroyed, true);
    assert.equal(plain.breakFx, null);
});

check('player carrying fragile into a pit reports fragile destruction', () => {
    resetActors();
    const player = box(120, 80);
    state.player = player;
    const pit = new Pit(120, 80, 40, 40);
    const fragile = cargo('fragile', 500, 500, 'player');
    state.packages = [fragile];
    assert.equal(pit.update([player]), 'Fragile Package Destroyed!');
    assert.equal(fragile.isDestroyed, true);
    assert.ok(fragile.breakFx, 'carried fragile should shatter in the pit');

    const again = box(120, 80);
    state.player = again;
    const plain = cargo('standard', 500, 500, 'player');
    state.packages = [plain];
    assert.equal(new Pit(120, 80, 40, 40).update([again]), 'Fell into pit!');
    assert.equal(plain.isDestroyed, true);

    const solo = box(40, 40);
    state.player = solo;
    state.packages = [];
    assert.equal(new Pit(40, 40, 40, 40).update([solo]), 'Fell into pit!');
});

check('carried normal package is lost when an echo carries it into a broken crack', () => {
    resetActors();
    const ghost = { id: 1, x: 100, y: 100, w: 30, h: 30, isActive: true };
    state.activeGhosts = [ghost];
    state.player = box(0, 0);
    const crack = brokenCrack(100, 100);
    const pkg = cargo('standard', 500, 500, 'ghost_1');
    state.packages = [pkg];
    assert.equal(crack.update([ghost]), 'Package lost!');
    assert.equal(pkg.isDestroyed, true);
    assert.equal(pkg.breakFx, null);
    assert.equal(ghost.isActive, false);
});

check('an intact crack does not swallow a package sitting on it', () => {
    resetActors();
    const crack = new CrackedFloor(100, 100, 40, 40, 'fast');
    const pkg = cargo('fragile', 100, 100);
    state.packages = [pkg];
    assert.equal(crack.update([]), null);
    assert.equal(pkg.isDestroyed, false);
    assert.equal(crack.broken, false);
    assert.equal(crack.collapsing, false);
});

check('sim: dropped fragile and normal cargo fail, then the run resets', () => {
    const idx = LEVELS.findIndex(l => l.name.startsWith('W2-L1'));
    assert.ok(idx >= 0);
    loadLevel({ level: idx, levelName: LEVELS[idx].name });
    const crack = state.cracks.find(c => c.x >= 280);
    assert.ok(crack);
    crack.broken = true;
    const pkg = state.packages[0];
    pkg.type = 'fragile';
    // W2-L1 cracks are taller than a package. The kill hole is the inner fraction,
    // so the package has to sit with its center in that hole, not on the tile corner.
    pkg.x = crack.x + (crack.w - pkg.w) / 2;
    pkg.y = crack.y + (crack.h - pkg.h) / 2;
    pkg.carriedBy = null;
    main.stepSimulation();
    assert.equal(state.failMessage, 'Fragile Package Destroyed!');
    assert.equal(pkg.isDestroyed, true);
    assert.ok(pkg.breakFx);
    assert.ok(state.failTimer > 0);
    const hold = state.failTimer;
    for (let i = 0; i < hold; i++) main.stepSimulation();
    assert.equal(state.failTimer, 0);
    assert.equal(state.failMessage, '');
    assert.equal(state.gameState, 'PLAYING');
    assert.equal(state.packages[0].isDestroyed, false, 'reset restores the package');

    loadLevel({ level: idx, levelName: LEVELS[idx].name });
    const crack2 = state.cracks.find(c => c.x >= 280);
    crack2.broken = true;
    const normal = state.packages[0];
    normal.x = crack2.x + (crack2.w - normal.w) / 2 + 2;
    normal.y = crack2.y + (crack2.h - normal.h) / 2 + 2;
    normal.carriedBy = null;
    main.stepSimulation();
    assert.equal(state.failMessage, 'Package lost!');
    assert.equal(normal.isDestroyed, true);
    assert.equal(normal.breakFx, null);
    assert.ok(state.failTimer > 0);
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('ok - fragile and normal cargo fall into pits and broken cracks');
