import assert from 'node:assert/strict';
import { createEncounterDirector, encounterRemaining, MAX_ALIVE, SPAWN_TELEGRAPH_TICKS, tickEncounterDirector, waveCountsFor } from '../src/rogue/encounterDirector.js';

assert.deepEqual(waveCountsFor('second-hand-halls'), [3, 4]);
assert.deepEqual(waveCountsFor('hourglass-warrens'), [3, 4, 5]);
assert.deepEqual(waveCountsFor('echo-courts'), [4, 5, 6]);
const points = Array.from({ length: 6 }, (_, i) => ({ x: 220 + i * 60, y: 50 + i * 40 }));
const a = createEncounterDirector({ biome: 'echo-courts', seed: 42, spawnPoints: points });
const b = createEncounterDirector({ biome: 'echo-courts', seed: 42, spawnPoints: points });
assert.deepEqual(a.spawnPoints, b.spawnPoints, 'same seed is deterministic');
assert.notDeepEqual(a.spawnPoints, createEncounterDirector({ biome: 'echo-courts', seed: 43, spawnPoints: points }).spawnPoints);
tickEncounterDirector(a, 0);
assert.equal(a.telegraphs.length, 4);
for (let i = 1; i < SPAWN_TELEGRAPH_TICKS; i++) assert.equal(tickEncounterDirector(a, 0).length, 0);
const spawned = tickEncounterDirector(a, 0);
assert.equal(spawned.length, 4);
assert.ok(spawned.length <= MAX_ALIVE);
assert.equal(encounterRemaining(a, 4), 15, 'remaining includes current and future waves');
console.log('encounter director ok');
