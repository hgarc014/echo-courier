import assert from 'node:assert/strict';
import { main, state, keys } from './harness/replay.mjs';
import { prevKeys } from '../src/core/input.js';
import { TickHound } from '../src/entities/hazards.js';

function release() {
    for (const key of Object.keys(keys)) keys[key] = false;
    Object.assign(prevKeys, keys);
}

function quietRun() {
    release();
    main.startRogueRun(33);
    state.rogueChamber.director = null;
    state.rogueChamber.type = 'timer';
    state.rogueChamber.ticksLeft = 100000;
    state.guards = [];
}

quietRun();
const baseMaxHp = state.player.maxHp;
main.applyAspect('hourglass-heart');
assert.equal(state.player.maxHp, baseMaxHp + 1);
const healed = state.player.hp;
main.applyAspect('hourglass-heart');
assert.equal(state.player.maxHp, baseMaxHp + 1, 'duplicate heart does not stack');
assert.equal(state.player.hp, healed);

main.applyAspect('stillstep');
main.applyAspect('sand-leech');
state.sand.sand = 0;
for (let i = 0; i < 60; i++) main.stepSimulation();
assert.equal(state.player.stillstepTicks, 60);
const target = new TickHound([
    { x: state.player.x + 34, y: state.player.y },
    { x: state.player.x + 35, y: state.player.y }
]);
target.hp = 1;
state.guards = [target];
const sandBeforeKill = state.sand.sand;
keys.space = true;
prevKeys.space = false;
main.stepSimulation();
keys.space = false;
for (let i = 0; i < 5; i++) main.stepSimulation();
assert.equal(target.dead, true, 'Stillstep empowers the next strike to two damage');
assert.ok(state.sand.sand >= sandBeforeKill + 0.25, 'Sand Leech pays sand on the kill');
assert.equal(state.player.stillstepTicks < 60, true, 'empowered strike consumes Stillstep');

quietRun();
main.applyAspect('second-strike');
const repeatTarget = new TickHound([
    { x: state.player.x + 34, y: state.player.y },
    { x: state.player.x + 35, y: state.player.y }
]);
repeatTarget.hp = 3;
repeatTarget.maxHp = 3;
state.guards = [repeatTarget];
keys.space = true;
prevKeys.space = false;
main.stepSimulation();
keys.space = false;
for (let i = 0; i < 6; i++) main.stepSimulation();
assert.equal(repeatTarget.hp, 2, 'the initial swing deals one damage');
for (let i = 0; i < 6; i++) main.stepSimulation();
assert.equal(repeatTarget.hp, 1, 'Second Strike repeats from the original position and facing');

console.log('combat aspect effects ok');
