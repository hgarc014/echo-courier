// Chamber clear predicates + the Rogue Run win hook. No chamber generation.
// Run: node tests/chamberClear.test.mjs
import assert from 'node:assert/strict';
import { chamberClearedByRift, chamberClearedByTimer, chamberClearedByWave } from '../src/rogue/chamberClear.js';
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

function begin() {
    release();
    main.startRogueRun(1);
    state.guards = [];
    assert.equal(state.rogueChamber, null);
    assert.equal(state.gameState, 'PLAYING');
}

function standInExit() {
    const z = state.deliveryZone;
    state.player.x = z.x + 4;
    state.player.y = z.y + 4;
}

begin();
standInExit();
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared', 'no chamber keeps the exit-zone clear');

begin();
state.rogueChamber = { type: 'timer', ticksLeft: 8 };
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'a live timer does not use the exit zone');
assert.equal(state.rogueChamber.ticksLeft, 8, 'this slice does not tick chambers');
state.rogueChamber.ticksLeft = 0;
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'wave', enemiesLeft: 2 };
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING');
state.rogueChamber.enemiesLeft = 0;
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'rift', zone: { x: 0, y: 0, w: 8, h: 8 } };
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING');
state.rogueChamber.zone = { x: state.player.x, y: state.player.y, w: 40, h: 40 };
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'rift' };
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'rift without a zone uses the delivery zone');
standInExit();
main.stepSimulation();
assert.equal(state.rogueRun.outcome, 'cleared');

begin();
state.rogueChamber = { type: 'bogus' };
standInExit();
main.stepSimulation();
assert.equal(state.gameState, 'PLAYING', 'unknown chamber type does not fall through to zone clear');

console.log('chamberClear ok');
