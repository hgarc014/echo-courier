import assert from 'node:assert/strict';
import { main, state, keys } from './harness/replay.mjs';
import { pollGamepad, prevKeys } from '../src/core/input.js';
import { TickHound } from '../src/entities/hazards.js';

function release() {
    for (const key of Object.keys(keys)) keys[key] = false;
    Object.assign(prevKeys, keys);
}

function beginWithWeapon(weapon) {
    release();
    main.startRogueRun(77);
    state.rogueRun.weapon = weapon;
    state.rogueChamber.director = null;
    state.rogueChamber.type = 'timer';
    state.rogueChamber.ticksLeft = 100000;
    state.guards = [];
}

beginWithWeapon('chrono-baton');
const batonTarget = new TickHound([{ x: state.player.x + 45, y: state.player.y }, { x: state.player.x + 46, y: state.player.y }]);
batonTarget.hp = 3; batonTarget.maxHp = 3;
state.guards = [batonTarget];
keys.k = true; prevKeys.k = false;
main.stepSimulation(); keys.k = false;
for (let i = 0; i < 19; i++) main.stepSimulation();
assert.equal(batonTarget.dead, true, 'Chrono Baton heavy is a committed three-damage reversal');

beginWithWeapon('parcel-driver');
const parcelTarget = new TickHound([{ x: state.player.x + 150, y: state.player.y }, { x: state.player.x + 151, y: state.player.y }]);
parcelTarget.stunTicks = 999;
state.guards = [parcelTarget];
keys.k = true; prevKeys.k = false;
main.stepSimulation(); keys.k = false;
for (let i = 0; i < 50; i++) main.stepSimulation();
assert.equal(parcelTarget.dead, true, 'Parcel Driver heavy launches lethal cargo downrange');

beginWithWeapon('parcel-driver');
keys.l = true; prevKeys.l = false;
main.stepSimulation(); keys.l = false;
for (let i = 0; i < 13; i++) main.stepSimulation();
assert.ok(state.rogueWeaponEffects.some(effect => effect.kind === 'decoy'), 'Parcel Driver special deploys a decoy parcel');

beginWithWeapon('route-cutter');
keys.l = true; prevKeys.l = false;
main.stepSimulation(); keys.l = false;
for (let i = 0; i < 15; i++) main.stepSimulation();
assert.equal(state.rogueWeaponEffects.filter(effect => effect.kind === 'cut').length, 2, 'Route Cutter special leaves a persistent crosscut');
const cutTicks = state.rogueWeaponEffects[0].ticks;
keys.e = true;
main.stepSimulation();
keys.e = false;
assert.equal(state.rogueWeaponEffects[0].ticks, cutTicks, 'temporal cuts persist and freeze while the courier rewinds');

console.log('weapon runtime integration ok');

const originalGetGamepads = navigator.getGamepads;
navigator.getGamepads = () => [{ buttons: Array.from({ length: 8 }, (_, index) => ({ pressed: index === 3 })) }];
assert.equal(pollGamepad().k, true, 'controller Y maps to heavy');
navigator.getGamepads = originalGetGamepads;
