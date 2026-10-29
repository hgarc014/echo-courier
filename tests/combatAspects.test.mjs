import assert from 'node:assert/strict';
import { COMBAT_ASPECTS, hasAspect, pickAspectChoices } from '../src/rogue/aspects.js';

assert.equal(COMBAT_ASPECTS.length, 8);
assert.equal(new Set(COMBAT_ASPECTS.map(aspect => aspect.id)).size, 8);
const first = pickAspectChoices(42, [], 3);
assert.equal(first.length, 3);
assert.equal(new Set(first.map(aspect => aspect.id)).size, 3, 'draft contains distinct choices');
assert.deepEqual(first, pickAspectChoices(42, [], 3), 'same run seed produces the same draft');
assert.notDeepEqual(first, pickAspectChoices(43, [], 3), 'different seed varies the draft');
const held = first.map(aspect => aspect.id);
const next = pickAspectChoices(42, held, 3);
assert.equal(next.some(aspect => held.includes(aspect.id)), false, 'held Aspects are excluded');
assert.equal(hasAspect({ aspects: held }, held[0]), true);
assert.equal(hasAspect({ aspects: held }, 'not-owned'), false);

console.log('combat aspects ok');
