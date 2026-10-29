import assert from 'node:assert/strict';
import { beginBossTelemetry, bossDurationReport, completeBossTelemetry, noteBossDamage } from '../src/rogue/bossTelemetry.js';

const entry = beginBossTelemetry('gatekeeper', 12, 60, { dashes: 2, cloaks: 1, tosses: 0, ruptures: 3 });
noteBossDamage(entry, 2);
noteBossDamage(entry, 1);
completeBossTelemetry(entry, 3660, { dashes: 5, cloaks: 1, tosses: 1, ruptures: 5 });
assert.equal(entry.durationTicks, 3600);
assert.equal(entry.durationSeconds, 60);
assert.equal(entry.playerDamageTaken, 3);
assert.deepEqual(entry.verbsUsed, { dashes: 3, cloaks: 0, tosses: 1, ruptures: 2 });
assert.equal(bossDurationReport([entry])[0].inTargetBand, true);
completeBossTelemetry(entry, 9999);
assert.equal(entry.killedAtTick, 3660, 'completion records once');

console.log('boss telemetry ok');
