import assert from 'node:assert/strict';
import { arenaPalette, visualHash } from '../src/rogue/arenaVisuals.js';

const halls = arenaPalette('second-hand-halls');
const warrens = arenaPalette('hourglass-warrens');
const courts = arenaPalette('echo-courts');

assert.equal(halls.accent, '#00d8e6');
assert.notEqual(halls.base, warrens.base);
assert.notEqual(warrens.accent, courts.accent);
assert.equal(arenaPalette('unknown'), halls, 'unknown biomes use the primary art direction');
assert.equal(visualHash(4, 9, 2), visualHash(4, 9, 2), 'decor layout must be deterministic');
assert.ok(visualHash(4, 9, 2) >= 0 && visualHash(4, 9, 2) <= 1);
assert.notEqual(visualHash(4, 9, 2), visualHash(5, 9, 2));

console.log('arenaVisuals.test.mjs passed');
