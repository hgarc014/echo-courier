import assert from 'node:assert/strict';
import {
    createSandState, canTimeRupture, timeRupture,
    TIME_RUPTURE_COST, TIME_RUPTURE_COOLDOWN, TIME_RUPTURE_FREEZE
} from '../src/systems/sandRewind.js';

const sand = createSandState({ maxSand: 3, sand: 3 });
const near = { x: 100, y: 100, w: 30, h: 30, dead: false };
const far = { x: 400, y: 400, w: 30, h: 30, dead: false };
assert.equal(canTimeRupture(sand, 0), true);
const result = timeRupture(sand, { x: 115, y: 115 }, [near, far], 0, 9);
assert.deepEqual(result, { ok: true, affected: 1 });
assert.equal(sand.sand, 3 - TIME_RUPTURE_COST);
assert.equal(near.ruptureTicks, TIME_RUPTURE_FREEZE);
assert.equal(near.rupturePendingId, 9);
assert.equal(far.ruptureTicks, undefined);
assert.equal(canTimeRupture(sand, TIME_RUPTURE_COOLDOWN), false, 'cooldown blocks rupture');
assert.equal(timeRupture(sand, { x: 115, y: 115 }, [near], TIME_RUPTURE_COOLDOWN, 10).ok, false);
const wideSand = createSandState({ maxSand: 3, sand: 3 });
const edge = { x: 320, y: 100, w: 30, h: 30, dead: false };
assert.equal(timeRupture(wideSand, { x: 115, y: 115 }, [edge], 0, 11, 230).affected, 1, 'wide rupture reaches beyond the baseline radius');

console.log('time rupture ok');

const { main, state, keys } = await import('./harness/replay.mjs');
const { prevKeys } = await import('../src/core/input.js');
const { Guard } = await import('../src/entities/hazards.js');

for (const key of Object.keys(keys)) keys[key] = false;
main.startRogueRun(7);
state.rogueChamber.director = null;
state.rogueChamber.type = 'timer';
state.rogueChamber.ticksLeft = 100000;
const hound = new Guard([{ x: state.player.x, y: state.player.y }, { x: state.player.x + 1, y: state.player.y }]);
state.guards = [hound];
state.sand.sand = 3;
keys.v = true;
prevKeys.v = false;
main.stepSimulation();
keys.v = false;
assert.equal(hound.ruptureTicks, TIME_RUPTURE_FREEZE - 1);
assert.equal(hound.hp, 3, 'rupture damage waits for the freeze to end');
assert.equal(state.player.hp, 5, 'a frozen overlapping hound deals no contact damage');
for (let i = 0; i < TIME_RUPTURE_FREEZE - 1; i++) main.stepSimulation();
assert.equal(hound.ruptureTicks, 0);
assert.equal(hound.hp, 2, 'freeze expiry deals exactly one damage');
assert.ok(state.rogueRun.ruptureCooldown > 0);

const campaignSand = state.sand.sand;
state.rogueRun.active = false;
keys.v = true;
prevKeys.v = false;
main.stepSimulation();
assert.equal(state.sand.sand, campaignSand, 'V is inert outside an active Rogue Run');
