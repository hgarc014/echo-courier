import assert from 'node:assert/strict';
import { composeEncounter } from '../src/rogue/encounterComposition.js';
import { beginEncounterTelemetry, completeEncounterTelemetry, summarizeEncounterTelemetry } from '../src/rogue/encounterTelemetry.js';

const a = beginEncounterTelemetry(composeEncounter({ seed: 1 }), 100);
const b = beginEncounterTelemetry(composeEncounter({ seed: 2 }), 500);
assert.equal(a.clearedAtTick, null);
completeEncounterTelemetry(a, 340);
completeEncounterTelemetry(b, 800);
assert.equal(a.durationTicks, 240);
assert.equal(b.durationTicks, 300);
completeEncounterTelemetry(a, 999);
assert.equal(a.durationTicks, 240, 'completion is recorded once');

assert.deepEqual(summarizeEncounterTelemetry([a, b]), {
    encounters: 2,
    completed: 2,
    averageDurationTicks: 270,
    shortestDurationTicks: 240,
    longestDurationTicks: 300,
    uniqueSignatures: 2
});

console.log('encounter telemetry ok');
