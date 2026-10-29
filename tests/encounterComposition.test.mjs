import assert from 'node:assert/strict';
import { authoredShellWalls, composeEncounter, ROOM_SHELLS, sweepEncounterSeeds, threatBudgetFor } from '../src/rogue/encounterComposition.js';

assert.equal(threatBudgetFor('second-hand-halls'), 4);
assert.equal(threatBudgetFor('hourglass-warrens'), 5);
assert.equal(threatBudgetFor('echo-courts'), 6);

const first = composeEncounter({ seed: 42, biome: 'hourglass-warrens' });
assert.deepEqual(first, composeEncounter({ seed: 42, biome: 'hourglass-warrens' }), 'same seed composes the same encounter');
assert.ok(first.threat <= first.budget, 'composition respects its threat budget');
assert.ok(first.objective.allowedSquads.includes(first.squad.family), 'objective supports the selected squad');
assert.equal(first.modifier.incompatibleTags.some(tag => first.shell.tags.includes(tag)), false, 'modifier supports the room shell');

const sweep = sweepEncounterSeeds({ count: 20, seed: 100, biome: 'echo-courts' });
assert.equal(sweep.encounters.length, 20);
assert.equal(sweep.invalidCount, 0, '20-seed sweep contains no invalid encounter');
assert.equal(sweep.adjacentRepeatCount, 0, 'room and squad families do not repeat back-to-back');
assert.ok(sweep.uniqueSignatures >= 12, `expected varied encounters, got ${sweep.uniqueSignatures}`);
assert.ok(sweep.encounters.some(encounter => encounter.squad.roles.includes('elite')), 'late-biome sweep can produce the elite squad');
for (const shell of ROOM_SHELLS) {
    const walls = authoredShellWalls(shell.id);
    assert.ok(walls.length >= 2, `${shell.id} has authored cover`);
    assert.ok(walls.every(wall => wall.x >= 0 && wall.y >= 0 && wall.x + wall.w <= 800 && wall.y + wall.h <= 600));
}

console.log('encounter composition ok');
