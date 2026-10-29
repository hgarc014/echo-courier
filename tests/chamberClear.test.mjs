// Chamber clear predicates + the Rogue Run win hook.
// A generated chamber ticks (timer / wave) and a clear opens the aspect picker.
// An earlier biome advances after the pick; the last biome still ends at Run Over.
// A null chamber still clears by standing in the exit zone.
// Run: node tests/chamberClear.test.mjs
import assert from 'node:assert/strict';
import { chamberClearedByRift, chamberClearedByTimer, chamberClearedByWave } from '../src/rogue/chamberClear.js';
import { chooseAspect } from '../src/ui/aspectPick.js';
import { main, state, keys } from './harness/replay.mjs';

const zone = { x: 0, y: 0, w: 10, h: 10 };
const inside = { x: 2, y: 2, w: 4, h: 4 };
assert.ok(chamberClearedByRift(inside, zone));
assert.ok(!chamberClearedByRift({ x: 50, y: 2, w: 4, h: 4 }, zone));
assert.ok(!chamberClearedByRift({ x: 10, y: 0, w: 4, h: 4 }, zone), 'edge touch is not a clear');
assert.ok(!chamberClearedByRift(null, zone));
assert.ok(!chamberClearedByRift(inside, null));

assert.equal(chamberClearedByTimer(0), true);
assert.equal(chamberClearedByTimer(-2), true);
assert.equal(chamberClearedByTimer(1), false);
assert.equal(chamberClearedByTimer(undefined), false);
assert.equal(chamberClearedByTimer(null), false);

assert.equal(chamberClearedByWave(0), true);
assert.equal(chamberClearedByWave(-1), true);
assert.equal(chamberClearedByWave(3), false);
assert.equal(chamberClearedByWave(undefined), false);
assert.equal(chamberClearedByWave(null), false);

function release() {
    for (const k of Object.keys(keys)) keys[k] = false;
}

function quiet() {
    state.guards = [];
    state.cameras = [];
    state.lasers = [];
    state.drones = [];
}

function begin() {
    release();
    main.startRogueRun(1);
    quiet();
    assert.equal(state.gameState, 'PLAYING');
}

function standInExit() {
    const z = state.deliveryZone;
    state.player.x = z.x + 4;
    state.player.y = z.y + 4;
}

// Walk Hourglass (and any later biome) to Run Over without a second echo-slot.
function settleRogueClear() {
    let steps = 0;
    while (state.rogueRun?.active && state.gameState === 'PLAYING' && steps++ < 6) {
        release();
        state.guards = [];
        state.cameras = [];
        state.lasers = [];
        state.drones = [];
        const chamber = state.rogueChamber;
        if (!chamber || chamber.aspectPending) break;
        if (chamber.type === 'timer') chamber.ticksLeft = 0;
        else if (chamber.type === 'wave') chamber.enemiesLeft = 0;
        else if (chamber.type === 'rift') chamber.zone = { x: state.player.x, y: state.player.y, w: 48, h: 48 };
        else break;
        main.stepSimulation();
        if (state.gameState !== 'PLAYING') break;
        if (state.rogueChamber?.aspectPending) chooseAspect('sand-tank');
        else break;
    }
}

release();
main.startRogueRun(1);
assert.equal(state.currentLevelMeta.name, 'Patrol Corridor');
assert.equal(state.currentLevelMeta.obj, 'Clear the guard wave.');
assert.equal(state.rogueChamber.type, 'wave');
assert.equal(state.rogueChamber.ticksLeft, null);
assert.ok(state.guards.length >= 6, 'opening wave has enough guards to pressure a fight');
assert.equal(state.rogueChamber.enemiesLeft, state.guards.length);
assert.equal(state.rogueChamber.aspectPending, false);
assert.equal(state.rogueChamber.zone.x < 0, true);

begin();
state.rogueChamber = null;
standInExit();
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared', 'no chamber keeps the exit-zone clear');

begin();
state.rogueChamber = { type: 'timer', ticksLeft: 8, aspectPending: false };
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'a live timer does not use the exit zone');
assert.equal(state.rogueChamber.ticksLeft, 7, 'timer chambers count down one tick');
state.rogueChamber.ticksLeft = 1;
main.stepSimulation();
assert.equal(state.rogueChamber.ticksLeft, 0);
assert.equal(state.rogueChamber.aspectPending, true);
assert.equal(state.rogueRun.outcome, null, 'clear waits on the aspect picker');
assert.equal(state.gameState, 'PLAYING');
main.levelFailed('Caught by Guard!');
assert.equal(state.failTimer, 0, 'fail checks are skipped while the aspect UI is open');
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.rogueRun.outcome, null);
const ghosts = state.currentLevelMeta.maxGhosts;
chooseAspect('echo-slot');
assert.equal(state.currentLevelMeta.maxGhosts, ghosts + 1);
assert.equal(state.rogueRun.outcome, null, 'Halls clear advances into the next biome');
assert.equal(state.rogueRun.active, true);
settleRogueClear();
assert.equal(state.rogueRun.outcome, 'cleared');
assert.equal(state.currentLevelMeta.maxGhosts, ghosts + 1);

begin();
state.sand.sand = 0;
const maxSand = state.sand.maxSand;
main.applyAspect('start-sand');
assert.equal(state.sand.sand, 0.5);
main.applyAspect('sand-tank');
assert.equal(state.sand.maxSand, maxSand + 1);
assert.equal(state.sand.sand, 1.5);
state.rogueRun.active = false;
const capped = state.currentLevelMeta.maxGhosts;
main.applyAspect('echo-slot');
main.applyAspect('sand-tank');
assert.equal(state.currentLevelMeta.maxGhosts, capped, 'aspects are run-only');
assert.equal(state.sand.maxSand, maxSand + 1);
state.rogueRun.active = true;

begin();
state.rogueChamber = { type: 'timer', ticksLeft: 10, aspectPending: false };
state.sand.history.push({
    x: state.player.x, y: state.player.y, facingX: 1, facingY: 0, vx: 0, vy: 0,
    cloakTimer: 0, dashCooldown: 0, tossCooldown: 0, carriedPackageId: null, tick: 0
});
keys.e = true;
main.stepSimulation();
assert.equal(state.sandRewinding, true);
assert.equal(state.rogueChamber.ticksLeft, 10, 'rewind ticks do not count the chamber clock');
release();

begin();
state.rogueChamber = { type: 'wave', enemiesLeft: 9, aspectPending: false };
state.guards = [
    { dead: false, state: 'distracted', update() { return null; } },
    { dead: true, state: 'distracted', update() { return null; } },
    { dead: false, state: 'chase', update() { return null; } }
];
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING');
assert.equal(state.rogueChamber.enemiesLeft, 2, 'dead guards are not enemies left; distracted guards still count');
state.guards = [
    { dead: true, state: 'distracted', update() { return null; } },
    { dead: true, state: 'patrol', update() { return null; } }
];
main.stepSimulation();
assert.equal(state.rogueChamber.enemiesLeft, 0);
assert.equal(state.rogueChamber.aspectPending, true);
chooseAspect('start-sand');
settleRogueClear();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'rift', zone: { x: 0, y: 0, w: 8, h: 8 }, aspectPending: false };
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING');
state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 40, h: 40 };
main.stepSimulation();
assert.equal(state.rogueChamber.aspectPending, true);
chooseAspect('sand-tank');
settleRogueClear();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'rift', aspectPending: false };
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'rift without a zone uses the delivery zone');
standInExit();
main.stepSimulation();
assert.equal(state.rogueChamber.aspectPending, true);
chooseAspect('echo-slot');
settleRogueClear();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'bogus', aspectPending: false };
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'unknown chamber type does not fall through to zone clear');
assert.equal(state.rogueChamber.aspectPending, false);

console.log('chamberClear ok');
