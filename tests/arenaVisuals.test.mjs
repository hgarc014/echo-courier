import assert from 'node:assert/strict';
import { arenaPalette, arenaSceneryLayout, visualHash } from '../src/rogue/arenaVisuals.js';

const halls = arenaPalette('second-hand-halls');
const warrens = arenaPalette('hourglass-warrens');
const courts = arenaPalette('echo-courts');
const still = arenaPalette('the-still');

assert.equal(halls.accent, '#00d8e6');
assert.notEqual(halls.base, warrens.base);
assert.notEqual(warrens.accent, courts.accent);
assert.notEqual(courts.base, still.base);
assert.equal(arenaPalette('unknown'), halls, 'unknown biomes use the primary art direction');
assert.equal(visualHash(4, 9, 2), visualHash(4, 9, 2), 'decor layout must be deterministic');
assert.ok(visualHash(4, 9, 2) >= 0 && visualHash(4, 9, 2) <= 1);
assert.notEqual(visualHash(4, 9, 2), visualHash(5, 9, 2));

const hallsLayout = arenaSceneryLayout({ w: 1600, h: 900 }, 'second-hand-halls');
const courtsLayout = arenaSceneryLayout({ w: 1600, h: 900 }, 'echo-courts');
const stillLayout = arenaSceneryLayout({ w: 1600, h: 900 }, 'the-still');
assert.equal(hallsLayout.length, 8);
assert.equal(hallsLayout[0].key, 'hallsRack');
assert.equal(courtsLayout[0].key, 'courtsPlinth');
assert.equal(stillLayout[0].key, 'stillPendulum');
assert.deepEqual(hallsLayout, arenaSceneryLayout({ w: 1600, h: 900 }, 'second-hand-halls'), 'scenery placement must be deterministic');
assert.ok(hallsLayout.every(item => item.x < 1600 * .4 || item.x > 1600 * .6 || item.y < 900 * .25 || item.y > 900 * .75), 'scenery should preserve the central combat read');

console.log('arenaVisuals.test.mjs passed');
