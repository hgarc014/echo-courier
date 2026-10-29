import assert from 'node:assert/strict';
import { authoredShellWalls, composeEncounter, ROOM_SHELLS, SQUAD_PROFILES, sweepEncounterSeeds, threatBudgetFor } from '../src/rogue/encounterComposition.js';

assert.equal(threatBudgetFor('second-hand-halls'), 4);
assert.equal(threatBudgetFor('hourglass-warrens'), 5);
assert.equal(threatBudgetFor('echo-courts'), 6);
assert.equal(threatBudgetFor('the-still'), 7);

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
const hallsSweep = sweepEncounterSeeds({ count: 40, seed: 1, biome: 'second-hand-halls' });
assert.ok(hallsSweep.encounters.every(encounter => !encounter.squad.roles.includes('sentry') && !encounter.squad.roles.includes('leech')), 'opening biome teaches melee pressure before specialist enemies');
const warrensSweep = sweepEncounterSeeds({ count: 40, seed: 1, biome: 'hourglass-warrens' });
assert.ok(warrensSweep.encounters.some(encounter => encounter.squad.roles.includes('sentry')), 'Warrens introduces ranged Sentries');
assert.ok(warrensSweep.encounters.every(encounter => !encounter.squad.roles.includes('leech')), 'Leeches wait until Echo Courts');
const stillSweep = sweepEncounterSeeds({ count: 80, seed: 1, biome: 'the-still' });
assert.ok(stillSweep.encounters.some(encounter => encounter.squad.id === 'rift-pincer'), 'The Still can compose the full three-family pincer');
assert.ok(stillSweep.encounters.every(encounter => encounter.squad.roles.filter(role => role === 'sentry').length <= 2), 'seed sweep caps simultaneous ranged lanes');
assert.equal(SQUAD_PROFILES.filter(profile => new Set(profile.roles.map(role => role === 'sentry' ? 'sentry' : (role === 'leech' ? 'leech' : 'hound'))).size >= 2).length >= 3, true, 'at least three squads mix enemy families');
for (const shell of ROOM_SHELLS) {
    const walls = authoredShellWalls(shell.id);
    assert.ok(walls.length >= 2, `${shell.id} has authored cover`);
    assert.ok(walls.every(wall => wall.x >= 0 && wall.y >= 0 && wall.x + wall.w <= 800 && wall.y + wall.h <= 600));
}

console.log('encounter composition ok');
