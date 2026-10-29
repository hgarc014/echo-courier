import assert from 'node:assert/strict';
import { createEncounterDirector, createPressureDirector, encounterRemaining, MAX_ALIVE, PRESSURE_INTERVAL_TICKS, SPAWN_TELEGRAPH_TICKS, tickEncounterDirector, tickPressureDirector, waveCountsFor } from '../src/rogue/encounterDirector.js';

assert.deepEqual(waveCountsFor('second-hand-halls'), [3, 4]);
assert.deepEqual(waveCountsFor('hourglass-warrens'), [3, 4, 5]);
assert.deepEqual(waveCountsFor('echo-courts'), [4, 5, 6]);
assert.deepEqual(waveCountsFor('the-still'), [5, 6, 6]);
const points = Array.from({ length: 6 }, (_, i) => ({ x: 220 + i * 60, y: 50 + i * 40 }));
const tenOrders = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(createEncounterDirector({ biome: 'second-hand-halls', seed: i + 1, spawnPoints: points }).spawnPoints)));
assert.equal(tenOrders.size, 10, 'ten seeds produce ten distinct spawn orders');
const a = createEncounterDirector({ biome: 'echo-courts', seed: 42, spawnPoints: points });
const b = createEncounterDirector({ biome: 'echo-courts', seed: 42, spawnPoints: points });
assert.deepEqual(a.spawnPoints, b.spawnPoints, 'same seed is deterministic');
assert.notDeepEqual(a.spawnPoints, createEncounterDirector({ biome: 'echo-courts', seed: 43, spawnPoints: points }).spawnPoints);
const composed = createEncounterDirector({
    biome: 'second-hand-halls', seed: 99, spawnPoints: points,
    encounter: { squad: { roles: ['bruiser', 'chaser', 'skirmisher'] } }
});
assert.deepEqual(composed.waves, [3, 4], 'composed squad size drives the runtime wave plan');
assert.equal(composed.encounter.squad.roles[0], 'bruiser');
tickEncounterDirector(a, 0);
assert.equal(a.telegraphs.length, 4);
for (let i = 1; i < SPAWN_TELEGRAPH_TICKS; i++) assert.equal(tickEncounterDirector(a, 0).length, 0);
const spawned = tickEncounterDirector(a, 0);
assert.equal(spawned.length, 4);
assert.deepEqual(spawned.slice(0, 3).map(point => point.role), ['chaser', 'chaser', 'chaser']);
assert.ok(spawned.length <= MAX_ALIVE);
assert.equal(encounterRemaining(a, 4), 15, 'remaining includes current and future waves');

const pressure = createPressureDirector({ seed: 9, spawnPoints: points });
tickPressureDirector(pressure, 0, { x: 115, y: 115 });
assert.equal(pressure.telegraphs.length, 1, 'survive pressure immediately warns one spawn');
assert.ok(Math.hypot(pressure.telegraphs[0].point.x + 15 - 115, pressure.telegraphs[0].point.y + 15 - 115) >= 200);
for (let i = 1; i < SPAWN_TELEGRAPH_TICKS; i++) assert.equal(tickPressureDirector(pressure, 0).length, 0);
assert.equal(tickPressureDirector(pressure, 0).length, 1);
assert.equal(pressure.nextIn, PRESSURE_INTERVAL_TICKS - SPAWN_TELEGRAPH_TICKS, 'spawn cadence continues while a telegraph resolves');

const capped = createPressureDirector({ seed: 10, spawnPoints: points });
tickPressureDirector(capped, MAX_ALIVE);
assert.equal(capped.telegraphs.length, 0, 'pressure queues nothing above the alive cap');

const movingPlayer = createPressureDirector({ seed: 12, spawnPoints: points });
tickPressureDirector(movingPlayer, 0);
for (let i = 1; i < SPAWN_TELEGRAPH_TICKS; i++) tickPressureDirector(movingPlayer, 0);
const warned = movingPlayer.telegraphs[0].point;
const avoided = tickPressureDirector(movingPlayer, 0, { x: warned.x + 15, y: warned.y + 15 });
assert.equal(avoided.length, 0, 'a player entering the warning circle prevents the unsafe spawn');
assert.equal(movingPlayer.telegraphs.length, 1, 'the unsafe spawn is re-telegraphed elsewhere');
assert.ok(Math.hypot(movingPlayer.telegraphs[0].point.x + 15 - (warned.x + 15), movingPlayer.telegraphs[0].point.y + 15 - (warned.y + 15)) >= 200);
console.log('encounter director ok');
